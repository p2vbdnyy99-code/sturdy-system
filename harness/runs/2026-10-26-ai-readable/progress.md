# Progress

- 26 Oct: steps 1–7 built (see plan.md). Fixed during the build: the
  seo.js rewrite had dropped sitemapXml (caught when the server failed to
  start; restored from HEAD and the diff re-read, lesson 14); icon buttons
  rendered twice; headings inside list items; empty sections on the
  search page.
- Curl checklist on the local server (port 8790, seeded Goa 25 + GeM 22):
  /pricing.md 200 text/markdown, X-Markdown-Tokens, noindex, canonical;
  Accept text/markdown → markdown with Vary; /pricing and Accept */* → HTML
  with the describedby Link; /does-not-exist.md 404 markdown; /dashboard.md
  and /api/md/insights 404 markdown; OPTIONS 204; llms.txt sections with .md
  links; llms-full 92,266 chars, 14 sources; ai.txt; catalog JSON; robots
  groups and Sitemap; ai-summary meta; 2 JSON-LD blocks; .md not in the
  sitemap; goa.md and gem.md real rows; keralam.md 301.
- verify.sh all pass. Nothing committed or deployed.
- 26 Oct, committed 6dd9687, pushed and deployed (founder: "Commit push
  deploy"); no tender was ANALYZING; no migration. Live, with a plain user
  agent (not counted as a crawler): /pricing.md 200 text/markdown,
  X-Markdown-Tokens 525, noindex, canonical; Accept text/markdown →
  markdown; /pricing and Accept */* → HTML with Link describedby and Vary;
  /does-not-exist.md and /dashboard.md 404 markdown; llms.txt with 46 list
  links; llms-full.txt 196,730 chars, 22 sources, 1.7 s cold; ai.txt;
  catalog 58 pages (46 lists); robots groups; ai-summary; 2 JSON-LD blocks;
  kerala.md 25 tenders of 2,599; keralam.md 301; no .md in the sitemap.
  Browser at 390 px: /, /pricing and a guide render with one H1, no sideways
  scroll, no CSP errors (3 console errors are the signed-out 401 from
  /bidpilot/me, as before).
