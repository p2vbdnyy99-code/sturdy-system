"""nightly.py: the founder's nightly email (built from insights-summary.mjs JSON)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ttm import nightly  # noqa: E402

SAMPLE = {
    "date": "2026-10-22",
    "today": {"visitors": 5, "views": 9, "signups": 1, "uploads": 1, "analyses": 1},
    "week": {"visitors": 52, "views": 98, "signups": 2, "uploads": 5, "analyses": 2, "failed": 1, "waiting": 2},
    "previousWeek": {"visitors": 50, "views": 94, "signups": 0, "uploads": 3, "analyses": 2},
    "series": [["2026-10-16", 8, 1, 0, 0], ["2026-10-17", 0, 0, 1, 0], ["2026-10-22", 5, 0, 1, 1]],
    "funnel": {"visitors": 52, "saw_signup": 15, "signups": 2, "uploaded": 2, "analysed": 2},
    "paid": {"companies": 1, "monthlyListPrice": 3999},
    "sources": [["google.com", 12], ["direct", 9]],
    "campaigns": [["linkedin.emd_exemption", 4]],
    "activity": [["signup", "Alpha <Bids> & Co", "2026-10-22T10:00:00Z"]],
    "stuck": [["Alpha <Bids> & Co", 2, 1]],
}


class NightlyTests(unittest.TestCase):
    def test_subject_and_text_carry_tonights_numbers(self):
        m = nightly.render(SAMPLE)
        self.assertEqual(m["subject"], "TenderTez tonight (22 Oct): 5 visitors, 1 sign-ups, 1 uploads, 1 analyses, 1 paying")
        self.assertIn("Paying customers: 1", m["text"])
        self.assertIn("52 visitor-days > 15 opened sign-up", m["text"])

    def test_html_is_gmail_safe_and_escapes_names(self):
        h = nightly.render(SAMPLE)["html"]
        for banned in ("<svg", "<script", "<img"):
            self.assertNotIn(banned, h)
        self.assertLess(len(h), 9000, "compact enough to paste into Gmail every night")
        self.assertIn("Alpha &lt;Bids&gt; &amp; Co", h)
        self.assertNotIn("Alpha <Bids>", h)
        self.assertIn("₹3,999 a month", h)
        self.assertIn("+4%", h, "visitors 52 vs 50 last week")
        self.assertIn("+2 new", h, "sign-ups from zero")
        self.assertIn("Activation gap", h)
        self.assertIn("https://tendertez.in/insights", h)

    def test_empty_week_still_renders(self):
        empty = {**SAMPLE, "today": dict.fromkeys(SAMPLE["today"], 0), "week": dict.fromkeys(SAMPLE["week"], 0),
                 "previousWeek": dict.fromkeys(SAMPLE["previousWeek"], 0),
                 "series": [["2026-10-22", 0, 0, 0, 0]], "funnel": dict.fromkeys(SAMPLE["funnel"], 0),
                 "paid": {"companies": 0, "monthlyListPrice": 0}, "sources": [], "campaigns": [], "activity": [], "stuck": []}
        m = nightly.render(empty)
        self.assertIn("No active paid plan yet", m["html"])
        self.assertNotIn("Activation gap", m["html"])
        self.assertIn("Nothing yet.", m["html"])


if __name__ == "__main__":
    unittest.main()
