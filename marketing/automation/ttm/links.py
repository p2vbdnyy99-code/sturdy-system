"""Marketing links: build them one way and check them before anything goes out.

Policy (marketing/link-policy.md): every link to TenderTez is a direct link to
https://tendertez.in/<page>, optionally with standard UTM parameters
(utm_source, utm_medium, utm_campaign). No Google redirect wrappers
(google.com/url?q=...), no link shorteners, no www./.com/http:// variants.

Why this exists: the Gmail connector used to create drafts rewrites every
link it is given, even a bare domain, into
https://www.google.com/url?q=...&ust=<creation time + 24 h>. After that time a
reader who clicks sees Google's "Redirect notice" page before TenderTez, and a
link copied from such an email into LinkedIn carries the wrapper with it.
check_text() catches that before a draft is approved.
"""
import re
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlparse, urlunparse

CANONICAL_HOST = "tendertez.in"
CANONICAL_ORIGIN = f"https://{CANONICAL_HOST}"
# Other names of the site that 301 to the canonical host; fine for a visitor,
# wrong in a marketing link (an extra redirect, and the UTM may be lost).
NON_CANONICAL_HOSTS = {"www.tendertez.in", "tendertez.com", "www.tendertez.com"}
GOOGLE_HOSTS = {"google.com", "www.google.com", "google.co.in", "www.google.co.in"}
SHORTENER_HOSTS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "lnkd.in", "rebrand.ly", "cutt.ly"}
# Pages of the app that need a signed-in user: they redirect to /login by
# design, so that redirect is not a broken marketing link.
APP_PATHS = re.compile(r"^/(dashboard|tenders/|company-profile|clients|feed|onboarding/)")
UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
CHANNELS = {"linkedin", "x", "facebook", "whatsapp", "email", "direct_outreach", "referral", "reddit", "youtube", "organic_search"}
URL_IN_TEXT = re.compile(r"""(?:https?://|www\.)[^\s<>"'\])]+|\b(?:[a-z0-9-]+\.)+(?:in|com)/[^\s<>"'\])]*""", re.I)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")[:40]


def build_url(path: str = "/", *, source: str = "", medium: str = "", campaign: str = "", content: str = "") -> str:
    """A direct canonical link, with standard UTMs when a source is given.

    build_url("/sample-analysis", source="linkedin", medium="organic", campaign="emd exemption")
    -> https://tendertez.in/sample-analysis?utm_source=linkedin&utm_medium=organic&utm_campaign=emd_exemption
    """
    if not path.startswith("/"):
        raise ValueError("path must start with '/' (a page on tendertez.in)")
    if source and source not in CHANNELS:
        raise ValueError(f"source must be one of: {', '.join(sorted(CHANNELS))}")
    if (medium or campaign or content) and not source:
        raise ValueError("utm_medium/utm_campaign need a utm_source")
    p = urlparse(urljoin(CANONICAL_ORIGIN, path))
    q = [(k, v) for k, v in parse_qsl(p.query) if k not in UTM_KEYS]
    if source:
        q.append(("utm_source", source))
        if medium:
            q.append(("utm_medium", _slug(medium)))
        if campaign:
            q.append(("utm_campaign", _slug(campaign)))
        if content:
            q.append(("utm_content", _slug(content)))
    return urlunparse(p._replace(scheme="https", netloc=CANONICAL_HOST, query=urlencode(q)))


def unwrap(url: str) -> str:
    """The real destination of a google.com/url?q=... wrapper (else the URL)."""
    p = urlparse(url)
    if (p.hostname or "") in GOOGLE_HOSTS and p.path == "/url":
        q = parse_qs(p.query)
        target = (q.get("q") or q.get("url") or [""])[0]
        return target or url
    return url


def check_url(url: str, *, allowed_hosts=None, fetcher=None, max_hops: int = 5) -> dict:
    """Check one link meant for a marketing message.

    allowed_hosts: extra hosts a message may link to besides tendertez.in
    (e.g. a government source cited in a post). fetcher(url) -> (status,
    location or None); omit it to skip the network check.
    """
    errors, warnings = [], []
    raw = (url or "").strip()
    p = urlparse(raw)
    host = (p.hostname or "").lower()
    if not raw or not p.scheme or not host or " " in raw:
        return {"url": raw, "ok": False, "errors": ["malformed URL"], "warnings": [], "final_url": None, "status": None}
    if host in GOOGLE_HOSTS and p.path == "/url":
        errors.append(f"Google redirect wrapper; use the direct link {unwrap(raw)}")
    elif host in SHORTENER_HOSTS:
        errors.append(f"link shortener ({host}); use the direct link")
    elif host in NON_CANONICAL_HOSTS:
        errors.append(f"non-canonical host {host}; use {CANONICAL_ORIGIN}")
    elif host != CANONICAL_HOST and host not in set(allowed_hosts or ()):
        errors.append(f"host {host} is not an approved destination")
    if p.scheme != "https" and not errors:
        errors.append("use https://")
    q = parse_qs(p.query)
    for key in UTM_KEYS:
        if len(q.get(key, [])) > 1:
            errors.append(f"{key} appears more than once")
    if host == CANONICAL_HOST and ("utm_medium" in q or "utm_campaign" in q) and "utm_source" not in q:
        errors.append("utm_medium/utm_campaign without utm_source")
    if host == CANONICAL_HOST and q.get("utm_source") and q["utm_source"][0] not in CHANNELS:
        # e.g. utm_source=linkedin.emd_exemption: the campaign belongs in utm_campaign
        errors.append(f"utm_source {q['utm_source'][0]!r} is not a standard source ({', '.join(sorted(CHANNELS))}); "
                      "put the campaign in utm_campaign")
    if host == CANONICAL_HOST and APP_PATHS.match(p.path or "/"):
        warnings.append("signed-in app page: visitors without an account are sent to /login; link a public page instead")

    final_url, status = raw, None
    if fetcher and not errors:
        current = raw
        for _ in range(max_hops + 1):
            try:
                status, location = fetcher(current)
            except Exception as e:  # network errors are reported, never raised
                errors.append(f"not reachable: {type(e).__name__}: {e}")
                status = None
                break
            if status in (301, 302, 303, 307, 308) and location:
                nxt = urljoin(current, location)
                np = urlparse(nxt)
                if np.path.startswith("/login") and host == CANONICAL_HOST and APP_PATHS.match(p.path or "/"):
                    final_url = nxt  # the app's own sign-in redirect: expected
                    break
                errors.append(f"redirects ({status}) to {nxt}; link the final address directly")
                final_url = nxt
                break
            final_url = current
            if status is None or status >= 400:
                errors.append(f"destination answered HTTP {status}")
            break
    return {"url": raw, "ok": not errors, "errors": errors, "warnings": warnings, "final_url": final_url, "status": status}


def find_urls(text: str) -> list:
    out = []
    for m in URL_IN_TEXT.finditer(text or ""):
        u = m.group(0).rstrip(".,;:!?")
        if not u.lower().startswith(("http://", "https://")):
            u = "https://" + u
        out.append(u)
    return out


def check_text(text: str, *, allowed_hosts=None, fetcher=None, require_link: bool = False) -> dict:
    """Check every link in a draft (email, post, message)."""
    results = [check_url(u, allowed_hosts=allowed_hosts, fetcher=fetcher) for u in find_urls(text)]
    errors = [f"{r['url']}: {e}" for r in results for e in r["errors"]]
    if require_link and not any(urlparse(r["url"]).hostname == CANONICAL_HOST for r in results):
        errors.append(f"no direct link to {CANONICAL_ORIGIN}")
    return {"ok": not errors, "errors": errors, "links": results}


def http_fetcher(timeout: int = 20):
    """A real fetcher for check_url: HEAD (GET if HEAD is refused), no redirects followed."""
    import urllib.error
    import urllib.request

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener(NoRedirect)

    def fetch(url):
        for method in ("HEAD", "GET"):
            req = urllib.request.Request(url, method=method, headers={"User-Agent": "TenderTezLinkCheck/1.0 (+https://tendertez.in)"})
            try:
                with opener.open(req, timeout=timeout) as r:
                    return r.status, None
            except urllib.error.HTTPError as e:
                if e.code == 405 and method == "HEAD":
                    continue
                return e.code, e.headers.get("Location")
        return None, None
    return fetch
