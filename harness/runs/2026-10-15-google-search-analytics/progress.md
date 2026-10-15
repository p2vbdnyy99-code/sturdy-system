# Progress: Google Search Console and Google Analytics

## Plan
- Steps 1–7: done. Every check is in `checks.md`.
- Still to do, after approval: commit, deploy, and the live steps listed under "Next action".

## Outputs
- `whatsapp-doc-assistant/backend/src/bidpilot/ga4.js` (new) and
  `backend/test/bidpilot/ga4.test.js` (new)
- `backend/src/bidpilot/visits.js` (`forward` option; two page names)
- `backend/src/seo.js` (two public pages, privacy description)
- `backend/src/config.js` (`bidpilot.ga4`)
- `backend/server.js` (wiring and startup log)
- `frontend/src/pages/Privacy.tsx`
- Docs: `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md`
- Scratchpad: `ga-stub.mjs`, `ga-verify.mjs`

## Decisions
- The founder chose server-side GA4 and DNS verification.
- GA4 receives only public pages, with a daily-rotating id, and no IP or user agent.
- The CSP is unchanged.
- Source and campaign are sent as custom parameters, because GA4's own
  acquisition attribution isn't reliable for Measurement Protocol hits (a
  developer report in Google's issue tracker, 238769739).

## Open issues
- `LAST_UPDATED` in the privacy policy is set to 16 October 2026, the
  go-live day in India.
- The privacy policy describes GA4 as in use. The founder should set the GA4
  secrets on the deploy day.
- An existing `google-site-verification` TXT record is on tendertez.in. Who
  created it is unknown. If Search Console shows a different value, add it as
  an extra record (append only).

## Next action
1. On the founder's "commit" / "deploy": check nothing is mid-analysis, then deploy.
2. The founder creates the GA4 property and stream, and sets the Fly secrets
   `BIDPILOT_GA4_MEASUREMENT_ID` and `BIDPILOT_GA4_API_SECRET`.
3. The founder adds the Search Console Domain property and submits the sitemap.
4. Check GA4 Realtime and Search Console.
