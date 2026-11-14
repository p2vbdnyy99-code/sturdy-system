# EMD calculator page (14 Nov 2026)

Why: the EMD guide brings most Google visits; none reach sign-up. A free calculator answers "how much EMD" without sign-up and links to the guide and the product. Founder authorised build and release on 14 Nov.

Steps
1. `frontend/src/pages/guides/EmdCalculator.tsx`, `guides.ts`, `routes.tsx`, `index.css`: page at /guides/emd-calculator. Output: calculator with the AIIMS worked example as its starting values. Check: unit test of the arithmetic; prerendered HTML has "Rs. 80,711.72".
2. `backend/src/seo.js` GUIDES entry. Check: geo.test (app and server lists agree), sitemap, llms.txt.
3. Link from the EMD guide. Check: prerendered EMD guide links to the calculator.
4. verify.sh, browser check (type a value, read the result, phone width), docs.

Rules: only figures already in the EMD guide's sources (GFR Rules 170, 171 as amended 01.01.2024; AIIMS NIT), read 9 Nov 2026. The page says the tender's own clause decides. No inline styles.
