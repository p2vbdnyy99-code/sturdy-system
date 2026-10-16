#!/usr/bin/env python3
"""TenderTez Marketing MCP server (stdio, JSON-RPC 2.0, standard library only).

Gives Claude Code the marketing workspace as tools: the content queue, the
prospect CRM and the weekly report. It has no tool that publishes, sends or
spends: those stay with the founder. Registered for this repository in
.mcp.json; data lives in marketing/data/ (git-ignored)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ttm import content, prospects, report  # noqa: E402
from ttm.config import load_config  # noqa: E402
from ttm.safety import KillSwitchOn  # noqa: E402

SERVER = {"name": "tendertez-marketing", "version": "1.0.0"}

_post = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "The post as it would be published."},
        "topic": {"type": "string"}, "audience": {"type": "string", "description": "Who exactly it is for."},
        "purpose": {"type": "string", "description": "What it should achieve (e.g. sign-ups from consultants)."},
        "cta": {"type": "string"}, "sources": {"type": "array", "items": {"type": "string"}, "description": "URLs backing any fact or number."},
        "scheduled_for": {"type": "string", "description": "YYYY-MM-DD"}, "kpi": {"type": "string"},
        "campaign": {"type": "string", "description": "Short campaign name for link tracking (default: from the topic)."},
    },
    "required": ["text", "topic", "audience", "purpose"],
}

TOOLS = [
    {"name": "get_content_queue", "description": "List queued content (drafts, approved, published) with status.",
     "inputSchema": {"type": "object", "properties": {"status": {"type": "string", "enum": ["", "draft", "approved", "published", "rejected"]},
                                                      "platform": {"type": "string"}}}},
    {"name": "draft_linkedin_post", "description": "Queue a LinkedIn draft for the founder's approval. Rejected if it makes a claim TenderTez can't back. Never publishes.", "inputSchema": _post},
    {"name": "draft_x_post", "description": "Queue an X post draft (280 characters, links count 23) for approval. Never publishes.", "inputSchema": _post},
    {"name": "search_saved_prospects", "description": "Search the prospect CRM.",
     "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "stage": {"type": "string"}, "tier": {"type": "string", "enum": ["", "A", "B", "C"]}}}},
    {"name": "get_prospect_details", "description": "One prospect with its evidence, score and history.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "save_prospect", "description": "Save a verified prospect. Needs company, category, source_url and evidence; a contact needs the public page it is published on. Duplicates and opted-out businesses are refused. Never guess contact details.",
     "inputSchema": {"type": "object", "properties": {
         "company": {"type": "string"}, "website": {"type": "string"}, "category": {"type": "string", "enum": prospects.CATEGORIES},
         "location": {"type": "string"}, "public_contact": {"type": "string"}, "contact_source_url": {"type": "string"},
         "source_url": {"type": "string"}, "evidence": {"type": "string"},
         "signals": {"type": "array", "items": {"type": "string", "enum": list(load_config()["lead_scoring"]["signals"])}},
         "use_case": {"type": "string"}, "suggested_first_message": {"type": "string"}, "channel_source": {"type": "string"},
         "verified": {"type": "boolean"}},
         "required": ["company", "category", "source_url", "evidence"]}},
    {"name": "mark_outreach_approved", "description": "Record the founder's approval of a prospect's drafted message (the prospect must be at 'drafted'). Does not send anything.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "approved_by": {"type": "string"}}, "required": ["id"]}},
    {"name": "record_campaign_result", "description": "Record what happened with a prospect: draft (with message), contacted, followed_up, reply, demo, activated, paid, lost, opt_out.",
     "inputSchema": {"type": "object", "properties": {
         "id": {"type": "string"}, "action": {"type": "string", "enum": ["draft", "contacted", "followed_up", "reply", "demo", "activated", "paid", "lost", "opt_out", "verify"]},
         "note": {"type": "string"}, "message": {"type": "string"}, "channel": {"type": "string"},
         "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]}, "amount_inr": {"type": "number"}, "plan": {"type": "string"}},
         "required": ["id", "action"]}},
    {"name": "get_weekly_marketing_report", "description": "The weekly report from recorded data only; missing data is labelled 'not available'.",
     "inputSchema": {"type": "object", "properties": {"end": {"type": "string", "description": "YYYY-MM-DD, default today"}}}},
]


def call(name: str, args: dict):
    cfg = load_config()
    if name == "get_content_queue":
        return content.queue(args.get("status", ""), args.get("platform", ""))
    if name in ("draft_linkedin_post", "draft_x_post"):
        return content.add_draft(platform="linkedin" if name == "draft_linkedin_post" else "x", text=args["text"], topic=args["topic"],
                                 audience=args["audience"], purpose=args["purpose"], cta=args.get("cta", ""),
                                 sources=args.get("sources", []), kpi=args.get("kpi", ""), scheduled_for=args.get("scheduled_for", ""),
                                 campaign=args.get("campaign", ""))
    if name == "search_saved_prospects":
        return prospects.list_prospects(args.get("query", ""), args.get("stage", ""), args.get("tier", ""))
    if name == "get_prospect_details":
        return prospects.get_prospect(args["id"])
    if name == "save_prospect":
        return prospects.save_prospect(args, cfg["lead_scoring"])
    if name == "mark_outreach_approved":
        return prospects.update_stage(args["id"], "approve", approved_by=args.get("approved_by", "founder"))
    if name == "record_campaign_result":
        fields = {k: args[k] for k in ("message", "channel", "sentiment", "amount_inr", "plan") if args.get(k) not in (None, "")}
        if args["action"] == "contacted":
            fields["follow_up_days"] = cfg["limits"]["follow_up_after_days"]
        return prospects.update_stage(args["id"], args["action"], args.get("note", ""), **fields)
    if name == "get_weekly_marketing_report":
        import datetime as dt
        r = report.weekly(dt.date.fromisoformat(args["end"]) if args.get("end") else None)
        return {"report": r, "markdown": report.to_markdown(r)}
    raise ValueError(f"Unknown tool {name}")


def handle(msg: dict):
    method, mid = msg.get("method"), msg.get("id")
    if mid is None:  # a notification: no reply
        return None
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": (msg.get("params") or {}).get("protocolVersion", "2024-11-05"),
            "capabilities": {"tools": {}}, "serverInfo": SERVER}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = msg.get("params") or {}
        try:
            out = call(params.get("name"), params.get("arguments") or {})
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False, indent=2)}]}}
        except (prospects.ProspectError, content.ContentError, KillSwitchOn, KeyError, ValueError) as e:
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}}
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            reply = handle(json.loads(line))
        except json.JSONDecodeError:
            reply = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
        if reply is not None:
            sys.stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
