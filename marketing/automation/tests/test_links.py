"""links.py: building direct links and catching bad ones (no network)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ttm import content, links  # noqa: E402

# A real wrapped link, as the Gmail connector stored it in a draft on 16 Oct 2026.
WRAPPED = ("https://www.google.com/url?q=https://tendertez.in/?utm_source%3Demail%26utm_medium%3Doutreach"
           "%26utm_campaign%3Dconsultants_oct26&source=gmail&ust=1792202248118000&sa=E")


def fake_fetcher(table):
    """table: url -> (status, location) or an exception to raise."""
    def fetch(url):
        result = table.get(url, (200, None))
        if isinstance(result, Exception):
            raise result
        return result
    return fetch


class BuildTests(unittest.TestCase):
    def test_direct_canonical_link_with_standard_utms(self):
        self.assertEqual(links.build_url("/"), "https://tendertez.in/")
        self.assertEqual(
            links.build_url("/sample-analysis", source="linkedin", medium="organic", campaign="EMD exemption"),
            "https://tendertez.in/sample-analysis?utm_source=linkedin&utm_medium=organic&utm_campaign=emd_exemption")

    def test_existing_query_kept_and_old_utms_replaced(self):
        url = links.build_url("/government-tenders?kind=state&state=Goa&utm_source=old", source="x", campaign="goa")
        self.assertEqual(url, "https://tendertez.in/government-tenders?kind=state&state=Goa&utm_source=x&utm_campaign=goa")

    def test_bad_input_refused(self):
        with self.assertRaises(ValueError):
            links.build_url("tendertez.in/x")
        with self.assertRaises(ValueError):
            links.build_url("/", source="myspace")
        with self.assertRaises(ValueError):
            links.build_url("/", campaign="c")  # campaign without a source


class CheckTests(unittest.TestCase):
    def test_google_wrapper_is_rejected_and_unwrapped(self):
        r = links.check_url(WRAPPED)
        self.assertFalse(r["ok"])
        self.assertIn("Google redirect wrapper", r["errors"][0])
        self.assertEqual(links.unwrap(WRAPPED),
                         "https://tendertez.in/?utm_source=email&utm_medium=outreach&utm_campaign=consultants_oct26")

    def test_shorteners_variants_malformed_and_foreign_hosts(self):
        for url, why in [("https://bit.ly/abc", "shortener"), ("https://www.tendertez.in/", "non-canonical"),
                         ("https://tendertez.com/pricing", "non-canonical"), ("http://tendertez.in/", "https"),
                         ("not a url", "malformed"), ("https://example.com/", "not an approved")]:
            r = links.check_url(url)
            self.assertFalse(r["ok"], url)
            self.assertTrue(any(why in e for e in r["errors"]), (url, r["errors"]))

    def test_cited_source_hosts_can_be_allowed(self):
        self.assertTrue(links.check_url("https://doe.gov.in/files/x.pdf", allowed_hosts={"doe.gov.in"})["ok"])

    def test_utm_problems(self):
        self.assertFalse(links.check_url("https://tendertez.in/?utm_campaign=x")["ok"])
        self.assertFalse(links.check_url("https://tendertez.in/?utm_source=a&utm_source=b")["ok"])
        self.assertTrue(links.check_url("https://tendertez.in/?utm_source=linkedin&utm_medium=organic&utm_campaign=a")["ok"])
        # the old calendar's form: campaign folded into the source
        old = links.check_url("https://tendertez.in?utm_source=linkedin.emd_exemption&utm_campaign=emd_exemption")
        self.assertFalse(old["ok"])
        self.assertIn("not a standard source", old["errors"][0])

    def test_network_check_redirects_errors_and_app_login(self):
        fetch = fake_fetcher({
            "https://tendertez.in/old": (301, "/new"),
            "https://tendertez.in/gone": (404, None),
            "https://tendertez.in/down": ConnectionError("timed out"),
            "https://tendertez.in/dashboard": (302, "/login?next=%2Fdashboard"),
        })
        self.assertTrue(links.check_url("https://tendertez.in/sample-analysis", fetcher=fetch)["ok"])
        r = links.check_url("https://tendertez.in/old", fetcher=fetch)
        self.assertFalse(r["ok"])
        self.assertEqual(r["final_url"], "https://tendertez.in/new")
        self.assertIn("HTTP 404", links.check_url("https://tendertez.in/gone", fetcher=fetch)["errors"][0])
        self.assertIn("not reachable", links.check_url("https://tendertez.in/down", fetcher=fetch)["errors"][0])
        app = links.check_url("https://tendertez.in/dashboard", fetcher=fetch)
        self.assertTrue(app["ok"], "the app's own sign-in redirect is not a broken link")
        self.assertTrue(app["warnings"], "but a public page is the better marketing link")

    def test_check_text_finds_wrapped_and_bare_links(self):
        text = f"Try it: {WRAPPED}. Or visit www.tendertez.in today."
        r = links.check_text(text, require_link=True)
        self.assertFalse(r["ok"])
        self.assertEqual(len(r["links"]), 2)
        self.assertTrue(any("no direct link" in e for e in r["errors"]))
        good = links.check_text("See https://tendertez.in/sample-analysis?utm_source=email&utm_campaign=x.", require_link=True)
        self.assertTrue(good["ok"], good["errors"])


class ContentIntegrationTests(unittest.TestCase):
    def test_lint_rejects_a_wrapped_link_in_a_post(self):
        r = content.lint(f"Read the EMD clause first. {WRAPPED}", "linkedin", [])
        self.assertFalse(r["ok"])
        self.assertTrue(any("Google redirect wrapper" in e for e in r["errors"]))

    def test_lint_allows_links_to_cited_sources(self):
        src = "https://doe.gov.in/files/circulars_document/Bid_Security_Earnest_Money_Deposit.pdf"
        r = content.lint(f"The 2020 memorandum: {src}", "linkedin", [src])
        self.assertTrue(r["ok"], r["errors"])


if __name__ == "__main__":
    unittest.main()


class DailyPostTests(unittest.TestCase):
    def fake_api(self, open_n=120, closing_n=9, tenders=None):
        tenders = [{"title": "Repair of road near PWD office " * 3, "closingAt": "2026-10-28T09:30:00Z", "tenderId": "2026_PWD_1_1"}] if tenders is None else tenders
        pages = [{"path": "/government-tenders/state/goa", "kind": "state", "state": "Goa", "organisation": "", "label": "Goa", "count": open_n},
                 {"path": "/government-tenders/list/gem", "kind": "gem", "state": "", "organisation": "", "label": "GeM", "count": 3000}]

        def fetch(url):
            if url.endswith("/landing"):
                return {"pages": pages}
            if "status=closing" in url:
                return {"total": closing_n, "tenders": []}
            return {"total": open_n, "tenders": tenders}
        return fetch

    def test_post_has_direct_tracked_links_and_fits_x(self):
        from ttm import daily_post
        import datetime as dt
        day = next(dt.date(2026, 10, d) for d in range(1, 30) if dt.date(2026, 10, d).toordinal() % 2 == 1)  # picks Goa
        out = daily_post.build("https://tendertez.in", day, fetch_json=self.fake_api())
        self.assertEqual(out["label"], "Goa")
        self.assertIn("https://tendertez.in/government-tenders/state/goa?utm_source=linkedin&utm_medium=organic&utm_campaign=daily_tenders", out["linkedin"])
        self.assertIn("utm_source=whatsapp&utm_medium=message", out["whatsapp"])
        self.assertLessEqual(content.x_length(out["x"]), 280)
        self.assertIn("Not every tender in India is listed", out["linkedin"])
        self.assertIn("closes 28 Oct", out["linkedin"])
        for platform, key in (("x", "x"), ("linkedin", "linkedin"), ("whatsapp", "whatsapp")):
            self.assertTrue(content.lint(out[key], platform, out["sources"])["ok"], content.lint(out[key], platform, out["sources"]))

    def test_no_open_tenders_is_an_error_not_an_empty_post(self):
        from ttm import daily_post
        import datetime as dt
        with self.assertRaises(daily_post.DailyPostError):
            daily_post.build("https://tendertez.in", dt.date(2026, 10, 17), fetch_json=self.fake_api(open_n=0, tenders=[]))
