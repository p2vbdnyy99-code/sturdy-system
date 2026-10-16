"""SEO audit of the live site from its sitemap: status, title, description,
canonical, robots directives, H1, Open Graph, structured data, images
without alt text and broken internal links in the server-sent HTML, plus
robots.txt, the sitemap and the domain redirects.

The site is a single-page app: pages other than the tender landing pages
get their headings and images from the browser app, so the server HTML is
what non-rendering crawlers and link previews see. Rendered checks (what
Google sees after running the app) are a separate, optional step."""
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

UA = "TenderTezSEOAudit/1.0 (+https://tendertez.in)"


def fetch(url: str, timeout: int = 30):
    """(status, final_url, body, headers). Doesn't follow redirects."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace"), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, url, e.read().decode("utf-8", "replace") if e.fp else "", dict(e.headers or {})


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title, self._in_title = "", False
        self.meta, self.links, self.canonical = {}, [], None
        self.h1, self.imgs_no_alt, self.jsonld = 0, 0, 0
        self._in_jsonld = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key.lower()] = a.get("content", "")
        elif tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img" and "alt" not in a:  # alt="" is a deliberate decorative image
            self.imgs_no_alt += 1
        elif tag == "script" and a.get("type") == "application/ld+json":
            self.jsonld += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def audit_page(url: str, body: str, status: int) -> dict:
    p = PageParser()
    p.feed(body)
    issues = []
    title, desc = p.title.strip(), p.meta.get("description", "")
    robots = p.meta.get("robots", "")
    if status != 200:
        issues.append(f"status {status}")
    if "noindex" in robots:
        issues.append("noindex on a sitemap URL")
    if not title:
        issues.append("no title")
    elif len(title) > 60:
        issues.append(f"title {len(title)} chars (over 60)")
    if not desc:
        issues.append("no meta description")
    elif not 70 <= len(desc) <= 200:
        issues.append(f"description {len(desc)} chars")
    if not p.canonical:
        issues.append("no canonical")
    elif p.canonical.rstrip("/") != url.rstrip("/"):
        issues.append(f"canonical {p.canonical} differs from the sitemap URL")
    if "og:title" not in p.meta:
        issues.append("no Open Graph tags")
    if p.imgs_no_alt:
        issues.append(f"{p.imgs_no_alt} images without alt text")
    return {"url": url, "status": status, "title": title, "description_len": len(desc), "canonical": p.canonical,
            "robots": robots, "h1_server": p.h1, "jsonld": p.jsonld, "links": p.links, "issues": issues}


def run(base: str = "https://tendertez.in", fetcher=fetch, check_links: bool = True, max_link_checks: int = 120) -> dict:
    base = base.rstrip("/")
    report = {"base": base, "site_issues": [], "pages": []}
    st, _, robots, _ = fetcher(f"{base}/robots.txt")
    if st != 200:
        report["site_issues"].append(f"robots.txt status {st}")
    elif f"Sitemap: {base}/sitemap.xml" not in robots:
        report["site_issues"].append("robots.txt doesn't point to the sitemap")
    st, _, sitemap, _ = fetcher(f"{base}/sitemap.xml")
    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap) if st == 200 else []
    if not urls:
        report["site_issues"].append(f"sitemap missing or empty (status {st})")
    host = urlparse(base).hostname
    for alt in (f"https://www.{host}/", f"http://{host}/"):
        s, _, _, h = fetcher(alt)
        loc = h.get("Location") or h.get("location") or ""
        if s not in (301, 308) or not loc.startswith(base):
            report["site_issues"].append(f"{alt} answers {s} -> {loc or 'no redirect'} (expected a permanent redirect to {base})")
    internal = set()
    for u in urls:
        s, _, body, _ = fetcher(u)
        page = audit_page(u, body, s)
        for href in page.pop("links"):
            full = urljoin(u, href)
            if urlparse(full).hostname == host:
                internal.add(full.split("#")[0])
        report["pages"].append(page)
    broken = []
    if check_links:
        known = {p["url"].rstrip("/") for p in report["pages"]}
        for link in sorted(internal)[:max_link_checks]:
            if link.rstrip("/") in known:
                continue
            s, _, _, _ = fetcher(link)
            if s >= 400:
                broken.append({"url": link, "status": s})
    report["broken_internal_links"] = broken
    report["summary"] = {
        "sitemap_urls": len(urls),
        "pages_with_issues": sum(1 for p in report["pages"] if p["issues"]),
        "broken_internal_links": len(broken),
        "pages_with_server_h1": sum(1 for p in report["pages"] if p["h1_server"]),
        "pages_with_structured_data": sum(1 for p in report["pages"] if p["jsonld"]),
    }
    return report


def to_markdown(r: dict) -> str:
    s = r["summary"]
    lines = [f"# SEO audit: {r['base']}", "", "Measured from the live server HTML (not estimates).", "",
             f"- Sitemap URLs: {s['sitemap_urls']}", f"- Pages with issues: {s['pages_with_issues']}",
             f"- Broken internal links (from server HTML): {s['broken_internal_links']}",
             f"- Pages with an H1 in the server HTML: {s['pages_with_server_h1']} (the other pages render their H1 in the browser app)",
             f"- Pages with structured data: {s['pages_with_structured_data']}", "",
             "## Site-wide", *([f"- {i}" for i in r["site_issues"]] or ["- none found"]), "", "## Pages with issues"]
    rows = [p for p in r["pages"] if p["issues"]]
    lines += [f"- {p['url']}: {'; '.join(p['issues'])}" for p in rows] or ["- none"]
    if r["broken_internal_links"]:
        lines += ["", "## Broken internal links", *[f"- {b['url']} ({b['status']})" for b in r["broken_internal_links"]]]
    return "\n".join(lines) + "\n"
