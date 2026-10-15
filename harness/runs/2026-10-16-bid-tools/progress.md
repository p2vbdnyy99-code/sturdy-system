# Progress: EMD and bank guarantees, saved-search alerts, annexure drafts

## Plan
- Steps 0–7 are done; see `checks.md`.
- Waiting for the founder's "commit" / "deploy". After a deploy, migration
  0011 runs in the machine.

## Outputs
- **Backend:**
  - Repos: `repo/securities.js`, `repo/savedSearches.js`,
    `repo/annexures.js`.
  - Drafting: `analysis/annexures.js`, `annexureDocx.js`, `letterhead.js`.
  - Schema: `schema/alerts.js`, plus `workflow.js` and `companyProfile.js`.
  - Migration: `drizzle/0011_yellow_peter_quill.sql`.
  - Routes: tenders, feed, dashboard, companies. `server.js` starts the
    matcher.
  - Tests: `securities`, `saved-searches` and `annexures`.
- **Frontend:**
  - New components: `SecuritiesPanel`, `securityLabels(.test)`,
    `SecuritiesSummary`, `AnnexuresTab`.
  - Changed pages: Feed (save and new list), the AppShell rail badge, the
    profile page's letterhead section.
  - Text and styles: Features, FAQ, Privacy, `index.css`.
- **Scratchpad:** `bid-tools-verify.mjs`, `match-now.mjs`, screenshots
  `bidtools-*.png`, and the annexure stand-in in `design-server.mjs`.

## Decisions
- The founder chose alerts in the app, Word files, and optional letterhead
  details.
- The AI never sees profile values; the server fills them in.
- Drafts store placeholders, so editing the profile updates the next
  download without another AI call.
- A daily cap of 30 drafts per company.

## Open issues
- The real AI's drafting quality is untested (the harness used a stand-in).
  After deploy, draft one annexure on a test tender and read the Word file.
- `LAST_UPDATED` must be the go-live day.
- 3 new lint warnings of an existing kind.

## Next action
Done on 16 Oct 2026 (IST):
- committed 4d550ea and deployed;
- migration 0011 run in production (11 → 12);
- the public pages checked live.

Still to do: check the signed-in features on production and make one real
AI draft. This needs the founder to try it, or their go-ahead for a test
account in the live database.
