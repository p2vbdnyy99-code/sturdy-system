# Progress

- 28 Oct: fixes 1–6 built and tested (see BIDPILOT_ARCHITECTURE.md
  "Security hardening").
- `npm audit fix --omit=dev` also pruned dev packages from the local
  node_modules (12 test files failed on missing pdfkit); `npm ci` restored
  them. The lock file change is version bumps only.
- The review's redirect evidence was wrong: the check matched "example.com"
  inside the login URL itself (CLAUDE.md lesson 29). With the check fixed,
  no off-site request happens either before or after; fix 4 stays as a
  precaution and fixes `next` being ignored.
- verify.sh all pass (checks.md); browser redirect check passes.

- 29 Oct: committed ac15e45, pushed, deployed (no tender ANALYZING; no
  migration). Live: unsigned POST /webhook answers 401 and the log shows
  the new "refused until it is set" warning; nosniff, referrer policy and
  HSTS (max-age=31536000) present with the CSP; public pages, sitemap and
  llms.txt answer 200; a wrong-password login answers 401 (not 429); Google
  sign-in still opens Google's sign-in page. The login `next` redirect was
  checked on the local server only (no test account in production).
