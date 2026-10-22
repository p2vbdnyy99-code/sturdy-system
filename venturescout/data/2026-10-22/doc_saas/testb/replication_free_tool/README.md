# Free-tool replication (pre-registered 2026-10-22, before any results)

## Documents (synthetic, no real data)

All are in `../pdf/`:

| File | Layout | Scanned (image-only) | Transactions |
|---|---|---|---|
| S05.pdf | Debit/Credit columns, DD/MM/YYYY, 2 pages | Yes | 40 |
| S10.pdf | Signed amount column, MM/DD/YYYY, 2 pages | Yes | 44 |
| S14.pdf | CR/DR suffixes, dates **without a year**, Dec→Jan, 3 pages | No | 41 |
| S25.pdf | Parenthesised negatives, no balance column, 2 obscured amounts, 2 pages | Yes | 31 |
| S29.pdf | Withdrawals/Deposits columns, 4 pages, a repeat across a page break | No | 44 |

On GitHub (sign in to see them):
`https://github.com/p2vbdnyy99-code/sturdy-system/tree/claude/ai-copilot-prototype-setup-pfgau3/venturescout/data/2026-10-22/doc_saas/testb/pdf`

## The prompt (copy exactly; do not edit)

```
Extract every transaction from this bank statement as JSON:
{"opening_balance": number, "closing_balance": number, "transactions": [{"date": "YYYY-MM-DD", "description": string, "amount": signed number (deposits/credits positive, withdrawals/debits negative), "balance": number or null}]}.
Include every transaction exactly once, in statement order. Do not include brought/carried-forward lines, page totals or summary totals. If the year is not printed, infer it from the statement period.
```

## Rules (fixed before results)

1. **Tool:** use one genuinely free consumer AI tool you already have access to, on its free plan. Do not use this Claude Code
   session. Record the tool, plan and any model name the app shows.
2. **Fresh chat per document:** start a new conversation for each document, attach the PDF, paste the prompt and send.
3. **No coaching:** do not add hints, re-prompt for accuracy, or correct anything.
4. **When to type "continue":** only if the reply is visibly **cut off** mid-JSON. Count each one as a manual intervention.
5. **Failures count as failures:** if the tool refuses, cannot open the PDF, or says it can't read a scanned page, record that as
   the result. Do not retry with another tool or format.
6. **Pasting results back:** copy the reply as-is, including any text around the JSON. Before scoring, Claude will strip
   surrounding prose and code fences, and will report having done so. Field values are never edited.

## Recording template (one line per document)

| Doc | Tool + plan + model shown | Date/time | PDF accepted? | "continue" count | Other intervention | Raw reply pasted? |
|---|---|---|---|---|---|---|
| S05 | | | | | | |
| S10 | | | | | | |
| S14 | | | | | | |
| S25 | | | | | | |
| S29 | | | | | | |

## Scoring

Each reply is saved here as `Sxx.json`, then scored with:

```
python3 score.py replication_free_tool --only-present
```

The scorer reports, with numerator and denominator:
- exact transaction rows;
- omitted and extra rows;
- date, amount, sign and balance accuracy;
- opening and closing balance accuracy;
- reconciliation;
- documents with any critical error.

Scanned and non-scanned documents are reported separately.

## Pre-registered interpretation

**Base:** 200 transactions across 5 documents.

| Outcome | Condition | Consequence |
|---|---|---|
| **Rejection confirmed** | ≥99% exact rows (≥198/200) **and** all 5 reconcile **and** no manual intervention beyond ≤1 "continue" per document | The generic converter stays rejected |
| **Reopen as VALIDATE** | <98% exact rows (<196/200), **or** ≥2 documents fail reconciliation, **or** scanned documents fail to process | Next: check whether the failures are reproducible and commercially meaningful. No build |
| **Inconclusive** | Anything between, or the tool could not be tested as specified | — |

**Limit:** five synthetic documents and one tool are a screening result, not proof of general reliability.

## Status (2026-10-22)

**NOT RUN.** Optional; it does not block the next phase. The document-SaaS investigation is closed
(see `reports/document-saas-decision.md`, Closure). A free-tool failure would not establish demand, willingness to pay or
distribution.
