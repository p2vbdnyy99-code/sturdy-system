# Marketing link policy

Applies to every email, post, message and document that links to TenderTez.
Enforced by `automation/ttm/links.py` (`check_url`, `check_text`) and by the
content queue's lint (`ttm lint`, `ttm draft`, the MCP draft tools).

## Rules

1. **Direct canonical links only:** `https://tendertez.in/<page>`.
   Not `www.tendertez.in`, not `tendertez.com`, not `http://`: they work for a
   visitor (301 to the canonical site) but add a redirect and can lose UTMs.
2. **No wrappers or shorteners:** no `google.com/url?q=…`, `bit.ly`, `lnkd.in`,
   `t.co` and so on.
3. **Link public pages**, not app pages (`/dashboard`, `/tenders/…` send people
   without an account to `/login`). Useful pages:
   - `https://tendertez.in/` (home)
   - `https://tendertez.in/sample-analysis` (a real analysis of a public AIIMS tender)
   - `https://tendertez.in/pricing`, `/faq`, `/features`, `/register`
   - `https://tendertez.in/government-tenders` and its state and organisation pages
4. **Tracking, when wanted:** standard UTMs on the direct link, built with
   `links.build_url(path, source=…, medium=…, campaign=…)`:
   `https://tendertez.in/sample-analysis?utm_source=linkedin&utm_medium=organic&utm_campaign=emd_exemption`.
   Sources: `linkedin`, `x`, `facebook`, `whatsapp`, `email`, `direct_outreach`,
   `referral`, `reddit`, `youtube`, `organic_search`.
   **What the site records:**
   - Today: `utm_source` only (the visits report's "Campaigns" and "Sign-ups
     by entry").
   - Once the change in `frontend/src/api/visits.ts` (16 Oct 2026) is
     deployed: `<utm_source>.<utm_campaign>` in the same field, e.g.
     `linkedin.emd_exemption`.
   - `utm_medium` stays in the link but is not stored.
5. **Check before approval:** `python3 -m ttm lint --platform email --text "…"`
   rejects wrapped, shortened, non-canonical and malformed links;
   `links.check_url(url, fetcher=links.http_fetcher())` also follows the link
   and reports redirects and errors.

## The Google-redirect problem (found 16 Oct 2026)

- **Symptom:** clicking the TenderTez link in an email opened a Google
  "Redirect notice" page first.
- **Cause, verified:** the Gmail connector used by Claude rewrites every link
  in a draft or sent message into
  `https://www.google.com/url?q=<link>&source=gmail&ust=<creation time + 24 h>`.
  - It does this in plain-text bodies, in HTML `href`s, and even to a bare
    `tendertez.in` without `https://`.
  - After that time, Google shows the notice before the real page. This was
    tested with three test drafts, read back as raw MIME, then deleted.
- **Not the cause:** the website (no redirects on `https://tendertez.in/…`),
  the browser, or link shorteners.
- **Fix:**
  - Claude no longer puts links in Gmail drafts or emails. Outreach text with
    clean links is delivered in a Google Doc (Drive keeps links exactly as
    written), and the founder pastes it into a new Gmail message; Gmail's own
    compose window keeps pasted links direct.
  - The daily post also goes to a Google Doc instead of an email.
  - `links.py` rejects any wrapped link that gets copied back into a draft.
