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


def _feed(checked, central, state=None, gem=None, enabled=True, error="CPPP answered 404"):
    def src(name, last):
        return {"list": name, "enabled": enabled, "lastSuccessAt": last,
                "lastFailureAt": checked if last != checked else None, "lastError": error if last != checked else None}
    return {"checkedAt": checked, "sources": [src("central", central), src("state", state or central), src("gem", gem or central)]}


class FeedFreshnessTests(unittest.TestCase):
    NOW = "2026-11-05T15:50:00+00:00"

    def night(self, feed, date="2026-11-05"):
        return {**SAMPLE, "date": date, "feed": feed}

    def test_statuses_follow_the_shared_thresholds(self):
        now = nightly._parse(self.NOW)
        cases = [("2026-11-05T14:00:00+00:00", "fresh"), ("2026-11-05T10:00:00+00:00", "delayed"),
                 ("2026-11-02T15:50:00+00:00", "stale"), ("2026-10-23T15:29:45+00:00", "unavailable"), (None, "unavailable")]
        for last, want in cases:
            self.assertEqual(nightly.feed_status({"enabled": True, "lastSuccessAt": last}, now), want, last)
        self.assertEqual(nightly.feed_status({"enabled": False, "lastSuccessAt": "2026-11-05T15:49:00+00:00"}, now), "unavailable",
                         "switched off")

    def test_all_fresh_is_quiet(self):
        m = nightly.render(self.night(_feed(self.NOW, "2026-11-05T15:40:00+00:00")))
        self.assertTrue(m["subject"].startswith("TenderTez tonight"))
        self.assertIn("Tender lists: all fresh", m["text"])

    def test_a_new_problem_alerts_once_and_names_the_last_success_and_error(self):
        stale = _feed(self.NOW, "2026-10-23T15:29:45+00:00")
        first = nightly.render(self.night(stale), previous=None)
        self.assertTrue(first["subject"].startswith("Tender feed alert (Central, State, GeM) · "))
        self.assertIn("Central unavailable since 23 Oct 2026 NEW", first["text"])
        self.assertIn("Latest error: CPPP answered 404", first["html"])
        self.assertIn("last update 23 Oct 2026", first["html"])
        # The same unresolved problem the next night: listed, not alerted again.
        nxt = nightly.render(self.night(_feed("2026-11-06T15:50:00+00:00", "2026-10-23T15:29:45+00:00"), "2026-11-06"),
                             previous=self.night(stale))
        self.assertTrue(nxt["subject"].startswith("TenderTez tonight"), nxt["subject"])
        self.assertIn("Central unavailable since 23 Oct 2026", nxt["text"])
        self.assertNotIn("NEW", nxt["text"])

    def test_getting_worse_alerts_again_and_recovery_is_noted(self):
        delayed = self.night(_feed(self.NOW, "2026-11-05T05:00:00+00:00"))
        stale_next = self.night(_feed("2026-11-06T15:50:00+00:00", "2026-11-05T05:00:00+00:00"), "2026-11-06")
        self.assertTrue(nightly.render(stale_next, previous=delayed)["subject"].startswith("Tender feed alert"), "delayed -> stale")
        recovered = self.night(_feed("2026-11-07T15:50:00+00:00", "2026-11-07T15:45:00+00:00"), "2026-11-07")
        m = nightly.render(recovered, previous=stale_next)
        self.assertTrue(m["subject"].startswith("TenderTez tonight"))
        self.assertIn("recovered", m["text"])
        self.assertIn("(recovered)", m["html"])

    def test_bad_timestamps_never_break_the_email(self):
        bad = {"checkedAt": "not-a-date", "sources": [{"list": "central", "enabled": True, "lastSuccessAt": "garbage"}]}
        m = nightly.render(self.night(bad), previous=self.night(bad))
        self.assertIn("Central unavailable since never", m["text"])

    def test_old_data_without_a_feed_still_renders_unchanged(self):
        m = nightly.render(SAMPLE)
        self.assertNotIn("Tender lists", m["html"])
        self.assertNotIn("Tender lists", m["text"])

    def test_previous_night_is_read_from_the_file_next_to_tonights(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            prev = Path(d) / "2026-11-04.json"
            prev.write_text(json.dumps({"date": "2026-11-04", "feed": {"checkedAt": "x", "sources": []}}), encoding="utf-8")
            self.assertEqual(nightly.previous_night(str(Path(d) / "2026-11-05.json"), "2026-11-05")["date"], "2026-11-04")
            self.assertIsNone(nightly.previous_night(str(Path(d) / "2026-11-07.json"), "2026-11-07"))
            self.assertIsNone(nightly.previous_night(str(Path(d) / "x.json"), None))
