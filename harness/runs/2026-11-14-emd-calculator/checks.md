- Calculator arithmetic test passes (frontend unit tests)
- geo.test: app and server guide lists agree, incl. /guides/emd-calculator
- Prerendered /guides/emd-calculator contains "80,711.72"
- Browser: typing 1000000 at 2% shows Rs. 20,000.00; no horizontal scroll at 390px
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 755, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 469, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 376, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 251ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 97, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
