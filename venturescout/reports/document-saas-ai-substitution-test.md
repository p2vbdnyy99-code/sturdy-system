# Test B: AI substitution and product differentiation

Run 2026-10-22. Everything is reproducible from `data/2026-10-22/doc_saas/testb/`:
- `generate.py`: seeded synthetic data generator
- `pdf/`: the 30 test statements
- `truth/`: ground truth
- `PROTOCOL.md`: fixed before extraction
- `outputs/`: raw, uncorrected model outputs
- `score.py` and `results.json`

## Screening decision: **STRONG AI-SUBSTITUTION WARNING (provisional)**

The tested general-purpose model got **779 of 779 transaction rows exactly right**, made **0 critical errors**, and
**reconciled 30 of 30** statements. That meets every condition of the pre-set "strong warning" threshold except one: the
tool was **not** a verified free consumer tier. The warning is therefore provisional until a free tool is checked (see
`document-saas-decision.md`, next action).

## B1. Workflow selection

Scores are from 1 (low) to 3 (high). For the risk rows, a higher score means more risk.

| Criterion | Bank/card statements | Invoice fields | Financial-statement tables | Scanned forms/receipts |
|---|---|---|---|---|
| Commercial relevance | 3 (bookkeeping imports; verified paid products) | 3 | 2 | 2 |
| Objective verifiability | **3** (balances must reconcile) | 2 (totals) | 2 | 1 |
| Expected difficulty for general AI | 2 (long, multi-page, signs) | 2 | 2 | 3 |
| Frequency of use | 3 (monthly) | 3 | 1 | 2 |
| Consequence of errors | 3 | 3 | 2 | 2 |
| Existing alternatives (risk) | 3 (crowded) | 3 (crowded) | 2 | 2 |
| Evidence of willingness to pay | 3 (Stripe-verified newcomer revenue; public prices) | 2 | 1 | 1 |
| Solo feasibility | 2 | 2 | 2 | 1 |

**Choice: bank statements.** They have the strongest objective ground truth (reconciliation) and the only verified paid newcomer.
The previous report's interest was **not** a criterion.

## B2. Dataset

- **30 synthetic statements, 58 pages, 779 transactions.** Banks and account holders are fictional; there is no personal data.
- **Six layout families of five documents each:**

  | Family | Format |
  |---|---|
  | 1 | Debit/Credit/Balance columns, DD/MM/YYYY |
  | 2 | Signed amount column, MM/DD/YY or MM/DD/YYYY |
  | 3 | CR/DR suffixes, "DD Mon" with **the year omitted** in some documents, including a December→January rollover |
  | 4 | European numbers (1.234,56), DD.MM.YYYY |
  | 5 | Parenthesised negatives, **no running balance**, "total money in/out" summary lines |
  | 6 | Withdrawals/Deposits columns, "Mon DD, YYYY" |

- **Variation built in:**
  - 1–4 pages per document;
  - repeated or omitted headers;
  - brought/carried-forward lines that are **not** transactions;
  - wrapped descriptions;
  - overdrafts with "OD" or negative balances;
  - legitimate identical repeats, including repeats across page breaks;
  - missing opening-balance lines (the opening must be inferred);
  - descriptions overprinting the amount column;
  - **6 image-only "scanned" documents**: rasterised at 110 dpi, rotated ±1.2°, blurred and noised.
- **Ground truth** is written by the generator at creation time and was not opened until scoring.
- **Known artefact:** the layout truncates long descriptions at 60 characters. A truncated description counts as correct only
  when it is a ≥50-character prefix of the truth. This rule was set before scoring.

## B3. Protocol

- **Tool:** the Claude model running this Claude Code session, reading each PDF through the session's file-read tool. That tool
  renders page images and exposes any text layer.
- **This is not a free consumer product.** No external OCR was used.
- **Free consumer tools were not tested**, because they need accounts and a human operator: ChatGPT free, Gemini, and the
  Claude.ai free tier. That capability is marked **untested**, not as a failure.
- **Instruction:** identical for every document (see `PROTOCOL.md`).
- **Contamination, which biases results toward the AI:**
  - The same model wrote the generator, so it knew the layout families and the description vocabulary. It never saw values.
  - It cross-checked amounts against running balances, and twice inferred obscured amounts from printed totals (S25).
    A careful user could prompt for this; a casual user might not.

## B4. Results (numerator/denominator)

| Metric | Result |
|---|---|
| Documents processed | 30/30 |
| Exact transaction rows (date, amount, balance and description all correct) | **779/779 (100%)** |
| Omitted rows / extra rows | 0 / 0 |
| Date accuracy | 779/779, including year-less dates and the year rollover |
| Amount accuracy / sign accuracy | 779/779 / 779/779 |
| Running-balance accuracy | 657/657 (rows that have a balance column) |
| Opening balance correct | 30/30, including 5 documents where it had to be inferred |
| Closing balance correct | 30/30 |
| Extracted data reconciles (opening + Σ amounts = closing) | 30/30 |
| Documents with ≥1 critical error | **0/30** |
| Scanned documents | 6/6 fully correct (2 obscured amounts recovered from totals) |
| Correction time needed | Not measured. Nothing needed correcting. |

## B5. Threshold application

- **Strong-warning criteria:**

  | Criterion | Met? |
  |---|---|
  | ≥99% exact rows | Yes |
  | No critical errors | Yes |
  | Intended documents processed | Yes |
  | Little manual correction | Yes |
  | Tool is free | **Not verified** |

- **Differentiation signals:** no reproducible weakness was observed on this dataset. None of the listed failure modes
  (omissions, sign errors, scanned failures, long multi-page failures) occurred.
- **Untested here:**
  - batch handling of many files in one go;
  - output-length limits in consumer chat apps;
  - real-world documents with logos, multi-account statements, mixed currencies, heavy scans, or 20+ page statements;
  - reproducibility across sessions.

## B6. Is any remaining differentiation commercially valuable?

| Possible advantage | Who has the problem | Do paid tools already offer it? | Could a free AI copy it? | Verdict |
|---|---|---|---|---|
| Batch processing of dozens of statements | Bookkeepers at month-end | Yes: DocuClipper, BankConv (10 PDFs per batch), invoicedataextraction (6,000 files) | Partly. Chat apps are one file at a time, but agent tools are improving | Already served |
| Accounting-ready exports (QBO/OFX/Xero) | QuickBooks/Xero users | Yes: BankConv, Bankstatemently, DocuClipper, MoneyThumb, a $79 Gumroad tool | Easily (formatting) | Already served |
| Automatic reconciliation and audit trail | Accountants | Yes: MoneyThumb reconcile, Bankstatemently benchmark | Easily, by prompt | Weak moat |
| Privacy (no retention, on-device) | Privacy-sensitive firms | Yes: BankConv deletes after 24h, an on-device $79 desktop tool, iOS on-device apps | N/A | Already served |
| Messy real-world scans and long statements | Everyone | Claimed by incumbents | **Unknown** | The only open question; needs real-looking data |

**Conclusion:** on this evidence, the generic "PDF statement → spreadsheet" problem is solved by a general-purpose model when
the user takes care. The remaining value is workflow convenience, which incumbents and newcomers already sell. Errors alone
would not prove willingness to pay, and here there were **no** errors.

## Reproducibility limitations

- **Single run, single model.** It cannot be guaranteed to reproduce identically.
- **Synthetic documents are cleaner than real statements.**
- **The extractor and the generator are the same model,** which raises its odds of success.
- **Results do not transfer to free tiers or other vendors' models** until tested.
