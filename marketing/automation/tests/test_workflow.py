"""End-to-end checks of the marketing workspace with mock data only (no
network, no external accounts). Run from marketing/automation:
    python3 -m unittest discover -s tests -v
"""
import datetime as dt
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from ttm import cli, content, dashboard, prospects, report, seo_audit, store  # noqa: E402
from ttm.config import load_config  # noqa: E402
from ttm.safety import KillSwitchOn  # noqa: E402
import mcp_server  # noqa: E402

CONSULTANT = {
    "company": "Example Tender Consultants Pvt Ltd",
    "website": "https://www.example-tenders.in",
    "category": "tender_consultant",
    "location": "Pune",
    "public_contact": "info@example-tenders.in",
    "contact_source_url": "https://www.example-tenders.in/contact",
    "source_url": "https://www.example-tenders.in/services",
    "evidence": "Services page offers e-tender bid preparation and GeM registration for clients.",
    "signals": ["explicit_tender_consultancy", "gem_seller"],
    "use_case": "Reads many client tenders a month; checklist and annexure drafts per client.",
}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["TTM_DATA_DIR"] = self.tmp.name
        os.environ["TTM_CONFIG"] = os.path.join(self.tmp.name, "config.json")
        self.rules = load_config()["lead_scoring"]

    def tearDown(self):
        os.environ.pop("TTM_DATA_DIR", None)
        os.environ.pop("TTM_CONFIG", None)
        self.tmp.cleanup()

    def set_config(self, **over):
        with open(os.environ["TTM_CONFIG"], "w") as f:
            json.dump(over, f)


class ProspectTests(Base):
    def test_save_scores_from_evidence(self):
        rec = prospects.save_prospect(CONSULTANT, self.rules)
        # 35 consultancy + 15 GeM + 15 category + 10 public contact
        self.assertEqual(rec["lead_score"], 75)
        self.assertEqual(rec["tier"], "A")
        self.assertIn("explicit_tender_consultancy +35", rec["score_reason"])
        self.assertEqual(rec["stage"], "identified")

    def test_duplicates_are_refused(self):
        prospects.save_prospect(CONSULTANT, self.rules)
        for variant in (
            {**CONSULTANT, "company": "Other name", "public_contact": ""},          # same domain
            {**CONSULTANT, "website": "", "public_contact": "", "company": "Example Tender Consultants Private Limited"},  # same name
            {**CONSULTANT, "website": "https://other.in", "company": "X", "contact_source_url": "https://other.in/c"},  # same email
        ):
            with self.assertRaises(prospects.ProspectError):
                prospects.save_prospect(variant, self.rules)
        self.assertEqual(len(prospects.list_prospects()), 1)

    def test_nothing_unverified_is_accepted(self):
        bad = [
            {**CONSULTANT, "source_url": ""},
            {**CONSULTANT, "evidence": ""},
            {**CONSULTANT, "category": "astrologer"},
            {**CONSULTANT, "contact_source_url": ""},          # contact without where it was published
            {**CONSULTANT, "public_contact": "maybe the owner"},
            {**CONSULTANT, "source_url": "example.com/x"},
        ]
        for b in bad:
            with self.assertRaises(prospects.ProspectError, msg=str(b)):
                prospects.validate(b)

    def test_funnel_needs_approval_before_contact_and_respects_opt_out(self):
        pid = prospects.save_prospect(CONSULTANT, self.rules)["id"]
        prospects.update_stage(pid, "verify")
        with self.assertRaises(prospects.ProspectError):
            prospects.update_stage(pid, "contacted")  # no approved draft yet
        prospects.update_stage(pid, "draft", message="Hello…", channel="email")
        prospects.update_stage(pid, "approve", approved_by="founder")
        rec = prospects.update_stage(pid, "contacted", channel="email", follow_up_days=5)
        self.assertEqual(rec["next_action_date"], (dt.date.today() + dt.timedelta(days=5)).isoformat())
        self.assertEqual(prospects.due_follow_ups(dt.date.today()), [])
        self.assertEqual([r["id"] for r in prospects.due_follow_ups(dt.date.today() + dt.timedelta(days=5))], [pid])
        prospects.update_stage(pid, "followed_up")
        self.assertEqual(prospects.due_follow_ups(dt.date.today() + dt.timedelta(days=30)), [], "one follow-up at most")
        prospects.update_stage(pid, "reply", sentiment="positive", channel="email")
        prospects.update_stage(pid, "demo")
        prospects.update_stage(pid, "activated")
        rec = prospects.update_stage(pid, "paid", amount_inr="3999", plan="Starter")
        self.assertEqual(rec["stage"], "paid")
        self.assertEqual(rec["revenue_inr"], 3999.0)

    def test_opt_out_blocks_everything_and_re_adding(self):
        pid = prospects.save_prospect(CONSULTANT, self.rules)["id"]
        prospects.update_stage(pid, "opt_out", note="replied no thanks")
        with self.assertRaises(prospects.ProspectError):
            prospects.update_stage(pid, "verify")
        # Gone from the CRM by hand, still suppressed:
        store.save("prospects", [])
        with self.assertRaises(prospects.ProspectError):
            prospects.save_prospect(CONSULTANT, self.rules)

    def test_contacted_before_blocks_a_second_first_message(self):
        prospects.add_prior_contact("info@example-tenders.in", "Example Tender Consultants", "2026-10-06", "gmail sent",
                                    aliases=["example-tenders-alt.com", "ETC Bid Services"])
        for variant in (
            CONSULTANT,                                                                    # same email / domain
            {**CONSULTANT, "website": "https://example-tenders-alt.com", "public_contact": "", "company": "Y"},  # alias domain
            {**CONSULTANT, "website": "", "public_contact": "", "company": "ETC Bid Services"},                 # alias name
        ):
            with self.assertRaises(prospects.ProspectError) as e:
                prospects.save_prospect(variant, self.rules)
            self.assertIn("Already contacted", str(e.exception))
        # A free-mail address blocks only that address, not every Gmail user.
        prospects.add_prior_contact("someconsultant@gmail.com", date="2026-10-08", source="gmail sent")
        rec = prospects.save_prospect({**CONSULTANT, "company": "Other Co", "website": "https://other.in",
                                       "public_contact": "other@gmail.com", "contact_source_url": "https://other.in/c"}, self.rules)
        self.assertEqual(rec["company"], "Other Co")
        with self.assertRaises(prospects.ProspectError):
            prospects.add_prior_contact("someconsultant@gmail.com")

    def test_import_of_an_outside_contact_at_its_real_stage(self):
        prospects.add_prior_contact("info@example-tenders.in", date="2026-10-07", source="gmail sent")
        with self.assertRaises(prospects.ProspectError):
            prospects.save_prospect(CONSULTANT, self.rules, "activated")      # no date / note
        rec = prospects.save_prospect({**CONSULTANT, "last_contact_date": "2026-10-15", "import_note": "signed up, 1 tender analysed",
                                       "follow_ups": 1}, self.rules, "activated")
        self.assertEqual((rec["stage"], rec["last_contact_date"], rec["follow_ups"]), ("activated", "2026-10-15", 1))
        with self.assertRaises(prospects.ProspectError):
            prospects.save_prospect(CONSULTANT, self.rules, "activated")      # still a duplicate
        prospects.update_stage(rec["id"], "paid", amount_inr=3999, plan="Starter")

    def test_kill_switch_stops_changes(self):
        self.set_config(kill_switch=True)
        with self.assertRaises(KillSwitchOn):
            prospects.save_prospect(CONSULTANT, self.rules)
        with self.assertRaises(KillSwitchOn):
            content.add_draft(platform="x", text="Read page 14 first.", topic="t", audience="a", purpose="p")


class ContentTests(Base):
    def test_claims_we_cant_back_are_blocked(self):
        for text in ("TenderTez is 100% accurate.", "Never miss a clause again", "Guaranteed to win more bids",
                     "Get a bid/no-bid verdict in seconds", "India's best tender tool", "Saves 10 hours per tender"):
            self.assertFalse(content.lint(text, "linkedin", [])["ok"], text)

    def test_numbers_need_a_source(self):
        text = "Under GFR Rule 170 the EMD is 2 to 5 percent of the estimated value."
        self.assertFalse(content.lint(text, "linkedin", [])["ok"])
        self.assertTrue(content.lint(text, "linkedin", ["https://doe.gov.in/"])["ok"])

    def test_x_counts_links_as_23_and_hashtags_are_limited(self):
        long_link = "https://tendertez.in/government-tenders/state/maharashtra?utm_source=x&utm_campaign=very-long-campaign"
        self.assertEqual(content.x_length(f"See {long_link}"), 4 + 23)
        self.assertFalse(content.lint("a #b #c #d", "x", [])["ok"])

    def test_queue_approve_publish_and_metrics(self):
        rec = content.add_draft(platform="linkedin", text="Check the annexures before the BOQ.", topic="Annexures first",
                                audience="tender consultants", purpose="educate", cta="Try the tender search")
        with self.assertRaises(content.ContentError):
            content.mark_published(rec["id"], "https://www.linkedin.com/feed/update/1")  # not approved
        with self.assertRaises(content.ContentError):
            content.add_draft(platform="linkedin", text="Check the annexures before the BOQ.", topic="x", audience="a", purpose="p")
        content.approve(rec["id"])
        content.mark_published(rec["id"], "https://www.linkedin.com/feed/update/1")
        item = content.record_metrics(rec["id"], impressions="120", comments="3", clicks="4", enquiries="1", reactions=None)
        self.assertEqual(item["metrics"], {"impressions": 120, "comments": 3, "clicks": 4, "enquiries": 1})
        self.assertEqual([i["status"] for i in content.queue()], ["published"])

    def test_one_topic_adapts_per_platform_with_tracked_links(self):
        topic = {"title": "Read the eligibility section first", "hook": "Most rejections start in the eligibility section.",
                 "points": ["Turnover years must match the NIT", "Experience must be similar work"],
                 "link": "https://tendertez.in/government-tenders", "campaign": "edu1"}
        drafts = content.adapt_topic(topic)
        self.assertEqual(set(drafts), set(content.PLATFORMS) - {"reddit"})
        self.assertIn("https://tendertez.in/government-tenders?utm_source=linkedin&utm_medium=organic&utm_campaign=edu1", drafts["linkedin"])
        self.assertIn("utm_source=whatsapp&utm_medium=message&utm_campaign=edu1", drafts["whatsapp"])
        self.assertIn("utm_source=x&utm_medium=organic&utm_campaign=edu1", drafts["x_thread"])
        for platform, text in drafts.items():
            self.assertTrue(content.lint(text, platform, [])["ok"], platform)
        self.assertEqual(content.with_utm("https://example.com/x", "x", "c"), "https://example.com/x", "only our own links get UTMs")

    def test_bank_guarantee_is_not_a_promise(self):
        self.assertTrue(content.lint("Check whether your EMD or bank guarantee needs extending.", "x", [])["ok"])
        self.assertTrue(content.lint("Track every performance guarantee.", "x", [])["ok"])
        self.assertFalse(content.lint("We guarantee you will qualify.", "x", [])["ok"])

    def test_queued_links_are_tagged_once(self):
        rec = content.add_draft(platform="linkedin", text="See https://tendertez.in/pricing. Or https://www.tendertez.in",
                                topic="EMD exemption for MSEs", audience="MSE bidders", purpose="sign-ups")
        self.assertIn("https://tendertez.in/pricing?utm_source=linkedin&utm_medium=organic&utm_campaign=emd_exemption_for_mses.", rec["text"])
        self.assertIn("https://tendertez.in/?utm_source=linkedin&utm_medium=organic", rec["text"], "www link made canonical")
        self.assertNotIn("www.tendertez.in", rec["text"])
        kept = content.add_draft(platform="x", text="Read https://tendertez.in/?utm_source=referral now", topic="t", audience="a", purpose="p")
        self.assertIn("utm_source=referral now", kept["text"], "existing tags are left alone")


class ReportTests(Base):
    def test_dashboard_shows_recorded_data_escaped(self):
        html = dashboard.build()
        self.assertIn("not available", html)
        prospects.save_prospect({**CONSULTANT, "company": "A <b>&</b> Co"}, self.rules)
        html = dashboard.build()
        self.assertIn("A &lt;b&gt;&amp;&lt;/b&gt; Co", html)
        self.assertNotIn("<b>&</b>", html)
        self.assertNotIn("http://", html.replace("http://www.w3", ""), "loads nothing from the network")

    def test_weekly_report_counts_only_what_was_recorded(self):
        empty = report.weekly()
        self.assertEqual(empty["revenue_inr"], report.NA)
        self.assertEqual(empty["site_metrics"], report.NA)
        pid = prospects.save_prospect(CONSULTANT, self.rules)["id"]
        prospects.update_stage(pid, "verify")
        prospects.update_stage(pid, "draft", message="Hi", channel="linkedin")
        prospects.update_stage(pid, "approve")
        prospects.update_stage(pid, "contacted", channel="linkedin")
        prospects.update_stage(pid, "reply", sentiment="positive", channel="linkedin")
        prospects.update_stage(pid, "demo")
        prospects.update_stage(pid, "activated")
        prospects.update_stage(pid, "paid", amount_inr=3999)
        report.record_site_metrics(dt.date.today().isoformat(), "visits-report.mjs", visits=40, signups=2)
        r = report.weekly()
        self.assertEqual((r["new_qualified_prospects"], r["contacted"], r["replies"], r["positive_replies"], r["demos"],
                          r["trial_users"], r["paying_customers_new"], r["revenue_inr"]), (1, 1, 1, 1, 1, 1, 1, 3999.0))
        self.assertEqual(r["contacts_by_channel"], {"linkedin": 1})
        md = report.to_markdown(r)
        self.assertIn("| Revenue (INR) | 3999.0 |", md)
        self.assertIn("visits-report.mjs", md)


class SeoAuditTests(unittest.TestCase):
    def test_audit_from_mock_site(self):
        base = "https://tendertez.in"
        good = ('<html><head><title>Pricing | TenderTez</title><meta name="description" content="' + "x" * 90 + '">'
                '<link rel="canonical" href="https://tendertez.in/pricing"><meta property="og:title" content="t"></head>'
                '<body><a href="/faq">faq</a><a href="/missing">bad</a><img src="a.png"></body></html>')
        pages = {
            f"{base}/robots.txt": (200, f"User-agent: *\nSitemap: {base}/sitemap.xml"),
            f"{base}/sitemap.xml": (200, f"<urlset><url><loc>{base}/pricing</loc></url><url><loc>{base}/faq</loc></url></urlset>"),
            f"{base}/pricing": (200, good),
            f"{base}/faq": (200, '<html><head><title>FAQ</title><meta name="robots" content="noindex"></head></html>'),
            f"{base}/missing": (404, ""),
        }

        def fake(url):
            if url in (f"https://www.tendertez.in/", "http://tendertez.in/"):
                return 301, url, "", {"Location": f"{base}/"}
            st, body = pages.get(url, (404, ""))
            return st, url, body, {}
        r = seo_audit.run(base, fetcher=fake)
        self.assertEqual(r["site_issues"], [])
        by = {p["url"]: p for p in r["pages"]}
        self.assertEqual(by[f"{base}/pricing"]["issues"], ["1 images without alt text"])
        self.assertIn("noindex on a sitemap URL", by[f"{base}/faq"]["issues"])
        self.assertEqual(r["broken_internal_links"], [{"url": f"{base}/missing", "status": 404}])
        self.assertIn("Broken internal links", seo_audit.to_markdown(r))


class McpTests(Base):
    def rpc(self, method, params=None, mid=1):
        return mcp_server.handle({"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}})

    def test_protocol_and_tools(self):
        init = self.rpc("initialize", {"protocolVersion": "2025-06-18"})
        self.assertEqual(init["result"]["serverInfo"]["name"], "tendertez-marketing")
        self.assertIsNone(mcp_server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        names = [t["name"] for t in self.rpc("tools/list")["result"]["tools"]]
        self.assertEqual(names, ["get_content_queue", "draft_linkedin_post", "draft_x_post", "search_saved_prospects",
                                 "get_prospect_details", "save_prospect", "mark_outreach_approved", "record_campaign_result",
                                 "get_weekly_marketing_report"])
        self.assertFalse(any("publish" in n or "send" in n for n in names), "no tool publishes or sends")

    def test_full_workflow_through_tools(self):
        call = lambda name, args: self.rpc("tools/call", {"name": name, "arguments": args})["result"]  # noqa: E731
        saved = json.loads(call("save_prospect", {**CONSULTANT, "verified": True})["content"][0]["text"])
        dup = call("save_prospect", CONSULTANT)
        self.assertTrue(dup["isError"])
        self.assertIn("Duplicate", dup["content"][0]["text"])
        pid = saved["id"]
        call("record_campaign_result", {"id": pid, "action": "draft", "message": "Hello", "channel": "email"})
        approved = json.loads(call("mark_outreach_approved", {"id": pid})["content"][0]["text"])
        self.assertEqual(approved["stage"], "approved")
        call("record_campaign_result", {"id": pid, "action": "contacted", "channel": "email"})
        call("record_campaign_result", {"id": pid, "action": "reply", "sentiment": "positive", "channel": "email"})
        post = call("draft_linkedin_post", {"text": "Read page 14 before you price the BOQ.", "topic": "BOQ", "audience": "civil contractors", "purpose": "educate"})
        self.assertNotIn("isError", post)
        blocked = call("draft_x_post", {"text": "100% accurate tender reading", "topic": "x", "audience": "a", "purpose": "p"})
        self.assertTrue(blocked["isError"])
        q = json.loads(call("get_content_queue", {})["content"][0]["text"])
        self.assertEqual(len(q), 1)
        rep = json.loads(call("get_weekly_marketing_report", {})["content"][0]["text"])
        self.assertEqual(rep["report"]["positive_replies"], 1)
        found = json.loads(call("search_saved_prospects", {"query": "pune"})["content"][0]["text"])
        self.assertEqual([p["id"] for p in found], [pid])


class CliTests(Base):
    def test_cli_leads_csv_has_the_requested_columns(self):
        prospects.save_prospect(CONSULTANT, self.rules)
        out = os.path.join(self.tmp.name, "leads.csv")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["leads-csv", out]), 0)
        import csv as _csv
        with open(out, encoding="utf-8") as f:
            rows = list(_csv.reader(f))
        self.assertEqual(rows[0][:4], ["Company", "Website", "Business category", "Location"])
        self.assertIn("Opt-out status", rows[0])
        self.assertEqual(rows[1][0], CONSULTANT["company"])

    def test_cli_add_list_report(self):
        from ttm import cli
        path = os.path.join(self.tmp.name, "p.json")
        with open(path, "w") as f:
            json.dump([CONSULTANT, CONSULTANT], f)
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(cli.main(["prospect-add", f"@{path}"]), 0)
        res = json.loads(out.getvalue())
        self.assertIn("saved", res[0])
        self.assertIn("Duplicate", res[1]["reason"])
        out = io.StringIO()
        with redirect_stdout(out):
            cli.main(["report"])
        self.assertIn("TenderTez weekly growth report", out.getvalue())
        backup = os.path.join(self.tmp.name, "backup.json")
        with redirect_stdout(io.StringIO()):
            cli.main(["export", backup])
        with open(backup, encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)["prospects"]), 1)


if __name__ == "__main__":
    unittest.main()
