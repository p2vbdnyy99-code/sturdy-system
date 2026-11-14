"""Read-only dashboard, standard library only. Phone-friendly; open from iPhone/iPad on the same Wi-Fi.

There is no login. Bind to 127.0.0.1 (default) or, for phone access, 0.0.0.0 on a trusted home
network only. For access away from home, put it behind Tailscale rather than opening a router port.
"""

from __future__ import annotations

from datetime import date
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import db as dbm
from .evaluator import evaluate
from .report import to_markdown, weekly_data

CSS = """
:root{--bg:#f7f7f5;--fg:#1c1c1a;--muted:#6b6b66;--card:#fff;--line:#e3e3de;--go:#1f7a4a;--bad:#a33a2a}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#eceae4;--muted:#9a988f;--card:#1e1e1c;--line:#33332f;--go:#5cc28c;--bad:#e2806f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 2px}h2{font-size:16px;margin:24px 0 8px}
.muted{color:var(--muted);font-size:13px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.kpi b{display:block;font-size:20px}.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card)}
td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;font-size:14px;white-space:nowrap}
.GO{color:var(--go);font-weight:600}.BLOCKED,.ENDED{color:var(--bad);font-weight:600}
pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:13px}
"""


def render(db_path: str) -> str:
    conn = dbm.connect(db_path)
    try:
        d = weekly_data(conn)
        evs = evaluate(conn)
        posts = conn.execute(
            """SELECT p.platform, p.url, p.posted_on, c.title,
                      (SELECT views FROM view_snapshots s WHERE s.post_id=p.id ORDER BY taken_on DESC, id DESC LIMIT 1) v
               FROM posts p JOIN clips c ON c.id=p.clip_id ORDER BY p.posted_on DESC, p.id DESC LIMIT 20"""
        ).fetchall()
    finally:
        conn.close()

    def rate(x):
        return dbm.fmt_money(x) + "/h" if x is not None else "n/a"

    kpi = lambda label, val: f'<div class="kpi"><span class="muted">{escape(label)}</span><b>{escape(val)}</b></div>'
    h = [f"<!doctype html><html lang=en><head><meta charset=utf-8>"
         f"<meta name=viewport content='width=device-width,initial-scale=1'><title>ClipForge</title>"
         f"<style>{CSS}</style></head><body><main>",
         f"<h1>ClipForge</h1><div class=muted>Week {d['start']} to {d['end']} · refreshed {date.today()}</div>",
         '<h2>Validation target</h2><div class="kpis">',
         kpi("Verified to date", f"{dbm.fmt_money(d['verified_total_cents'])} / {dbm.fmt_money(d['target_verified_cents'])}"),
         kpi("Clips published", f"{d['clips_published']} / {d['target_clips']}"),
         kpi("Verified per op. hour (week)", rate(d["verified_per_operating_hour"])),
         kpi("Estimated this week", dbm.fmt_money(round(d["estimated_week_cents"]))),
         "</div>",
         "<h2>Campaigns</h2><div class=wrap><table><tr><th>Verdict</th><th>Campaign</th><th>Exp./post</th>"
         "<th>Exp./hour</th><th>Notes</th></tr>"]
    for e in evs:
        notes = "; ".join(e.reasons + e.warnings)
        h.append(f"<tr><td class={e.verdict}>{e.verdict}</td><td>{escape(e.marketplace)}: {escape(e.name)}</td>"
                 f"<td>{dbm.fmt_money(e.expected_cents_per_post)}</td><td>{dbm.fmt_money(e.expected_cents_per_hour)}</td>"
                 f"<td>{escape(notes)}</td></tr>")
    h.append("</table></div>")
    if evs:
        h.append(f"<div class=muted>Expected values use: {escape(evs[0].view_source)}</div>")
    h.append("<h2>Recent posts</h2><div class=wrap><table><tr><th>Date</th><th>Platform</th><th>Clip</th><th>Views</th></tr>")
    for p in posts:
        h.append(f"<tr><td>{escape(p['posted_on'])}</td><td>{escape(p['platform'])}</td>"
                 f"<td><a href='{escape(p['url'], quote=True)}'>{escape(p['title'])}</a></td>"
                 f"<td>{'' if p['v'] is None else format(p['v'], ',')}</td></tr>")
    h.append("</table></div><h2>Weekly report</h2>")
    h.append(f"<pre>{escape(to_markdown(d))}</pre></main></body></html>")
    return "".join(h)


def serve(db_path: str, host: str = "127.0.0.1", port: int = 8765) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ("/", "/index.html"):
                self.send_error(404)
                return
            body = render(db_path).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    print(f"ClipForge dashboard on http://{host}:{port}  (Ctrl+C to stop)")
    if host == "0.0.0.0":
        print("Reachable from other devices on this network. No login: use on a trusted network only.")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
