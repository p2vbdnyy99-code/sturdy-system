import unittest
from datetime import date

from clipforge import db as dbm
from clipforge.cli import upsert_campaign
from clipforge.evaluator import Assumptions, evaluate, payout_for_views
from clipforge.report import to_markdown, weekly_data


def campaign(conn, **kw):
    base = dict(marketplace="vyro", name="c", cpm="3.00", platforms="tiktok", source_permission="explicit",
                checked_on="2026-11-10")
    base.update(kw)
    return upsert_campaign(conn, base)


class Payout(unittest.TestCase):
    def test_threshold_and_cap(self):
        self.assertEqual(payout_for_views(999, 100, 1000, None), 0)       # below threshold pays nothing
        self.assertEqual(payout_for_views(1000, 100, 1000, None), 100)    # $1 CPM x 1,000 views = $1.00
        self.assertEqual(payout_for_views(1_000_000, 300, 0, 30_000), 30_000)  # capped at $300

    def test_money(self):
        self.assertEqual(dbm.to_cents("$1,234.56"), 123456)
        self.assertEqual(dbm.fmt_money(-150), "-$1.50")


class Evaluator(unittest.TestCase):
    def setUp(self):
        self.conn = dbm.connect(":memory:")
        self.today = date(2026, 11, 14)

    def test_prior_expected_value(self):
        campaign(self.conn)  # $3 CPM, no threshold, no cap
        ev = evaluate(self.conn, Assumptions(minutes_per_clip=20), self.today)[0]
        # E[views] under prior = .5*300 + .3*1500 + .15*8000 + .05*50000 = 4300 -> 4300*300/1000 = 1290 cents
        self.assertAlmostEqual(ev.expected_cents_per_post, 1290)
        self.assertAlmostEqual(ev.expected_cents_per_hour, 1290 * 3)
        self.assertEqual(ev.verdict, "GO")

    def test_threshold_reduces_value(self):
        campaign(self.conn, min_views="2000")
        ev = evaluate(self.conn, today=self.today)[0]
        # Only the 8,000 and 50,000 buckets pay: (.15*8000 + .05*50000) * 0.3 = 1110 cents
        self.assertAlmostEqual(ev.expected_cents_per_post, 1110)

    def test_gates(self):
        campaign(self.conn, name="rights", source_permission="unclear")
        campaign(self.conn, name="platform", platforms="x")
        campaign(self.conn, name="broke", budget_total="100", budget_remaining="0")
        campaign(self.conn, name="old", ends_on="2026-11-01")
        evs = {e.name: e for e in evaluate(self.conn, today=self.today)}
        self.assertEqual(evs["rights"].verdict, "BLOCKED")
        self.assertEqual(evs["platform"].verdict, "BLOCKED")
        self.assertEqual(evs["broke"].verdict, "BLOCKED")
        self.assertEqual(evs["old"].verdict, "ENDED")

    def test_stale_warning_and_bad_permission(self):
        campaign(self.conn, checked_on="2026-10-01")
        self.assertTrue(evaluate(self.conn, today=self.today)[0].warnings)
        with self.assertRaises(ValueError):
            campaign(self.conn, name="x", source_permission="yes")

    def test_switches_to_own_data(self):
        cid = campaign(self.conn)
        clip = self.conn.execute("INSERT INTO clips (campaign_id, title) VALUES (?, 't')", (cid,)).lastrowid
        for i in range(10):
            pid = self.conn.execute("INSERT INTO posts (clip_id, platform, account, url) VALUES (?,?,?,?)",
                                    (clip, "tiktok", "a", f"u{i}")).lastrowid
            self.conn.execute("INSERT INTO view_snapshots (post_id, views) VALUES (?, 1000)", (pid,))
        ev = evaluate(self.conn, today=self.today)[0]
        self.assertIn("own data", ev.view_source)
        self.assertAlmostEqual(ev.expected_cents_per_post, 300)


class Report(unittest.TestCase):
    def test_week(self):
        conn = dbm.connect(":memory:")
        cid = campaign(conn, cpm="1.00", min_views="1000")
        clip = conn.execute("INSERT INTO clips (campaign_id, title) VALUES (?, 't')", (cid,)).lastrowid
        pid = conn.execute("INSERT INTO posts (clip_id, platform, account, url, posted_on) VALUES (?,?,?,?,?)",
                           (clip, "tiktok", "a", "u", "2026-11-03")).lastrowid
        # Week of Mon 2026-11-09: 800 views before, 3000 at end. Threshold crossed this week:
        # pay(3000) - pay(800) = $3.00 - $0 = 300 cents (not 2200 views x CPM = 220 cents).
        conn.execute("INSERT INTO view_snapshots (post_id, taken_on, views) VALUES (?,?,?)", (pid, "2026-11-08", 800))
        conn.execute("INSERT INTO view_snapshots (post_id, taken_on, views) VALUES (?,?,?)", (pid, "2026-11-13", 3000))
        conn.execute("INSERT INTO payouts (campaign_id, amount_cents, received_on) VALUES (?,?,?)", (cid, 250, "2026-11-12"))
        conn.execute("INSERT INTO payouts (campaign_id, amount_cents, received_on) VALUES (?,?,?)", (cid, 999, "2026-11-02"))
        conn.execute("INSERT INTO work_log (minutes, worked_on, activity) VALUES (60, '2026-11-10', 'clipping')")
        conn.execute("INSERT INTO work_log (minutes, worked_on, activity) VALUES (120, '2026-11-11', 'building')")
        d = weekly_data(conn, date(2026, 11, 14))
        self.assertEqual((d["start"], d["end"]), ("2026-11-09", "2026-11-15"))
        self.assertAlmostEqual(d["estimated_week_cents"], 300)
        self.assertEqual(d["verified_week_cents"], 250)
        self.assertEqual(d["verified_total_cents"], 1249)
        self.assertAlmostEqual(d["verified_per_operating_hour"], 250)
        self.assertAlmostEqual(d["verified_per_total_hour"], 250 / 3)
        md = to_markdown(d)
        self.assertIn("$2.50", md)
        self.assertIn("$12.49 of $50.00", md)


if __name__ == "__main__":
    unittest.main()
