# Blind-agent re-run (DEVIATION from the pre-registered free-tool replication)

Run 2026-10-22 at the user's request. A fresh Claude instance (separate agent, no access to generate.py, truth/ or outputs/)
extracted S05, S10, S14, S25, S29 with the identical PROTOCOL prompt, one document at a time, no hints or retries.
This removes the generator-contamination limitation only. It is still a frontier model, NOT a free consumer tier,
so it does not satisfy the pre-registered replication. Scored with: python3 score.py replication_blind_agent --only-present

## Result (scored 2026-10-22)

- **Rows:** 200/200 transaction rows exact; 0 omitted and 0 extra.
- **Fields:** dates, amounts, signs and balances (169/169) all correct.
- **Statements:** 5/5 opening and closing balances correct; 5/5 reconcile.
- **Critical errors:** 0/5 documents.
- **Scanned documents** (S05, S10, S25): all correct, including 3 obscured amounts the agent inferred from balances or printed totals.
- **Description guesses:** the agent completed 3 cut-off descriptions by guessing. The scorer accepts these because each is a
  ≥50-character prefix of the truth.
- **Report discrepancy:** the agent's own report said S10 had 45 transactions; the file contains 44, matching the truth.

**Classification:** this deviation run would have met the "rejection confirmed" thresholds. It is **not** the pre-registered
free-tool test, which remains not started.
