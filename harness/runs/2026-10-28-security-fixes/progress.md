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

Next: founder's go-ahead to commit and deploy (no migration). After deploy:
live check that an unsigned POST /webhook answers 401 and the three headers
are present.
