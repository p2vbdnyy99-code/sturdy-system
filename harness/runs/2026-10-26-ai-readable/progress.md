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
