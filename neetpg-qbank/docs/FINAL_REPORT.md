# NEET-PG 2027 evidence analysis: final report

Generated 27 Oct 2026. Data: `pipeline/registry/*.json` → `pipeline/analyze.py` → `data/evidence.json`. The app shows the same material under **Evidence**, **Modules**, **Review queue** and **Analytics**.

Each finding carries one of five labels:

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Stated in an official notice, or in a news or court report quoting officials. |
| **[RECONSTRUCTED]** | Third-party recall of what candidates remembered. Not an official paper. |
| **[ESTIMATE]** | A coaching or survey figure, or a number computed from one. |
| **[RECOMMENDATION]** | Educational advice written by Claude (AI). Not derived from exam counts. |
| **[HYPOTHESIS]** | A reasoned guess that the data cannot confirm. |

## Bottom line

- **No lawful source gives question-level past papers.** No official question text exists for NEET-PG, INI-CET or FMGE for any year. **[VERIFIED]**
- **Topic-level recall exists for only two sessions:** NEET-PG 2025 and INI-CET May 2026. Together they give 39 observations and 38 distinct concepts. **[RECONSTRUCTED]**
- **Only one concept appears in more than one session:** Courvoisier's law. **[RECONSTRUCTED]**
- **A 10-year topic-frequency or trend analysis cannot be done honestly with this data, so none was produced.** The app shows empty or "not run" states instead of invented numbers.
- **What to do with this:** study the full syllabus. Use the priorities below only to break ties. No recommendation here predicts what will appear in the exam.

---

## 1. Dataset coverage

| Exam | Years with any topic-level data | Notes |
|---|---|---|
| NEET-PG | 2025 (32 observations, source S02) | 2017–2022: no usable source. 2023 and 2026: claims only. 2024: subject table found but rejected (S06). |
| INI-CET | May 2026 (7 observations, S08) | 2025 sessions: claims only. |
| FMGE | none | June 2026: news about video questions only. |
| AIIMS-PG, JIPMER-PG | none | — |

The full exam-by-year grid is in `evidence.json → coverage`. The Evidence page shows it as a table.

## 2. Source quality

There are 18 sources (S01–S18). Each record lists category, publisher, date, confidence, licence and notes; see `pipeline/registry/sources.json` or **Review queue → Source registry**.

| Category | Sources | How the analysis uses them |
|---|---|---|
| Official notices **[VERIFIED]** | S01: NBEMS 2026 bulletin | Exam pattern only. |
| News reports quoting officials or courts **[VERIFIED]** | S12, S14, S15 | Official facts. |
| Third-party recall, confidence low **[RECONSTRUCTED]** | S02 (NEET-PG 2025), S08 (INI-CET May 2026) | The only topic observations. |
| Forecasts, surveys and reports | S03, S04, S05, S07, S09, S10, S11, S16, S17 | Claims only, never counted as observations. The pipeline enforces this (`test_forecast_cannot_be_an_observation`). |
| Rejected | S06: DBMCI 2024 | Subject table failed checks; excluded from every ranking. |
| Research dataset | S13: MedMCQA | Not used as exam evidence (details below). |
| Licensed media | S18: 4 Wikimedia Commons images | Openly licensed teaching images, not exam images. |

Why MedMCQA was not used as exam evidence:
- 1,318 of the 4,183 items in its validation split (31.5%) are Dental.
- Topic labels are empty.
- Session attribution is unreliable.

## 3. Subject distribution by exam **[ESTIMATE]**

**NEET-PG 2025 (S02).**
- The table records 195 of 200 questions (97.5%), and Psychiatry is folded into Medicine.
- Largest shares, with 95% Wilson intervals:

| Subject | Share | 95% interval |
|---|---|---|
| Medicine + Psychiatry | 15.4% | 11.0–21.1% |
| Obstetrics & Gynaecology | 10.3% | 6.7–15.3% |
| Surgery | 9.2% | 5.9–14.1% |
| Community Medicine | 8.2% | 5.1–12.9% |

- The intervals overlap heavily, so the ranking among the middle subjects is not reliable. It is a single source.

**Other exams.**
- MedMCQA subject mixes are shown as a compilation. They are not tied to any session.
- No usable subject table exists for INI-CET or FMGE. The only figure is a coaching claim of roughly 18–20 Surgery questions in INI-CET May 2026 (C20).

## 4. Topic-frequency ranking

Among the 38 concepts, 37 have one session and 1 has two. **This is not a frequency ranking.** It cannot separate high-yield topics from topics that happened to be remembered. See `rankings.historical_frequency` for the list. **[RECONSTRUCTED]**

## 5. Recurrence across sessions **[RECONSTRUCTED]**

Duplicate handling: the pipeline counts one event per exam + session + concept, however many websites repeat it.

**Concepts reported in two or more sessions**

| Concept | Sessions |
|---|---|
| Courvoisier's law | NEET-PG 2025 (S02); INI-CET May 2026 (S08) |

**Subtopics reported in two sessions**

| Subtopic | Concepts reported |
|---|---|
| Pathology › GIT & liver | PBC/AMA; Barrett oesophagus |
| Surgery › Head injury | diffuse axonal injury; GCS |
| Surgery › Gallbladder & biliary | Courvoisier |

The coaching claims of "~30% repeats" (C12, C13) are **[ESTIMATE]**s that cannot be checked. A third survey (C14) gives respondent estimates ranging from 0 to 70+ questions.

## 6. Recency and trend analysis

**Not run.**
- **The rule:** each period (2017–21 and 2022–26) needs at least 3 sessions with topic data, and a concept must appear in at least 3 sessions.
- **The data:** 0 sessions in 2017–21, 2 sessions in 2022–26, and at most 2 sessions for any concept.
- **Result:** no topic can be called rising, falling or persistent.

## 7. Image-based questions

- **The claims disagree.** For NEET-PG 2025 they range from "~50%" (C01) to "18–25%" (C02). For NEET-PG 2026, from "very few" (C03) to "significant presence" (C04). **[ESTIMATE]**
- **Only one observation is explicitly image-based:** Barrett oesophagus histology, INI-CET May 2026. 28 observations have unknown image status. **[RECONSTRUCTED]**
- **So the app makes no claim about the share of image questions.**
- **The four images in the bank** are Commons images with licence records. Each is captioned "not an exam image".
- **No image, ECG, radiology or histology finding was fabricated.** Modules without a licensed image describe what to look for in text only.

## 8. Video-based questions and video learning

| Exam | What is known |
|---|---|
| FMGE June 2026 | **[VERIFIED]** Video questions were introduced, per a news report quoting officials (S12). The count is disputed: 12–14 per officials, about 12 per the SC petition, 12–28 per students, and 20+ per a coaching report (C08). |
| NEET-PG 2026 | No video questions reported (C05, C06). |
| INI-CET | No evidence collected. |

- **[HYPOTHESIS]** If video questions spread to NEET-PG, they would likely test what a still image cannot show: gait, movement disorders, seizures, auscultation, examination signs and procedures.
- The Evidence page links YouTube searches for these 8 categories. The links are labelled as study aids, not exam evidence.

## 9. Integrated-subject analysis

- **[RECONSTRUCTED]** 3 of the 39 observations (7.7%) were reported under one subject but map to another. 39 is a very small sample.
  - Fat embolism: listed under Medicine, maps to Orthopaedics.
  - Pritchard MgSO4 regimen: listed under Pharmacology, maps to Obstetrics.
  - HIV–TB ART timing: listed under PSM, maps to Medicine.
- **[ESTIMATE]** A coaching report says integrated questions are increasing in FMGE, e.g. Medicine + Pharmacology (C18).
- **[RECOMMENDATION]** 8 of the 10 A-category groups span 2–4 subjects; A4 and A7 cover one subject each.

## 10. High-value concept list **[RECOMMENDATION]**

**B (computed):** Courvoisier's law.

**A (foundational, Claude's judgement):**

| Group | Topic | Modules |
|---|---|---|
| A1 | Acid-base and electrolytes | — |
| A2 | Shock, resuscitation and trauma | trauma-gcs |
| A3 | Antimicrobials | — |
| A4 | Cell injury and neoplasia | leukaemia translocations |
| A5 | Autonomic pharmacology | phaeochromocytoma |
| A6 | ECG and arrhythmias | — |
| A7 | Screening and biases | screening-biases |
| A8 | Obstetric emergencies | PPH, eclampsia, labour emergencies |
| A9 | HIV and TB | hiv-tb |
| A10 | Endocrine emergencies | adrenal insufficiency |

**C (important, not seen in this small dataset):**
- sepsis
- anaphylaxis
- stroke thrombolysis
- neonatal resuscitation
- the 2024 criminal laws (BNS/BNSS/BSA)
- snakebite and poisoning
- national programme updates
- video-assessable skills **[HYPOTHESIS]**

## 11. Differences between exams

| | NEET-PG | INI-CET | FMGE |
|---|---|---|---|
| **Pattern** | **[VERIFIED]** 180 MCQs, 5 sections × 36, 42 min per section, sections lock, +4/−1/0 (2026 bulletin; no 2027 bulletin yet) | — | — |
| **Answer keys** | **[VERIFIED]** 2025 key published after Supreme Court orders, without questions. From Oct 2026 candidates see their responses by question ID. | **[VERIFIED]** No official key. | Sources conflict. |
| **Other observations** | — | **[ESTIMATE]** Clinical vignettes reported at 70–75% (C11). | **[ESTIMATE]** The only exam with documented video questions. |

## 12. NEET-PG 2027 study priorities **[RECOMMENDATION]**

1. Cover the whole syllabus. The planner's Cover phase allocates time by the old NBE blueprint weights scaled to 180. Those weights are an **[ESTIMATE]**.
2. Within each subject, work through the A groups first, then B, then C.
3. Revise on the 1/3/7/21/60-day schedule.
4. Use timed grand tests in the final 15% of the plan.

None of these is a guarantee of what will appear.

## 13. Original MCQs for priority topics

- 14 modules with 2 MCQs each, 28 in total. They enter the bank as `m-<module>-<n>`.
- Each MCQ has a reason for every option, a pearl and a high-yield rating.
- All are labelled **AI-GENERATED · UNREVIEWED** and are kept separate from any historical question. The bank has no historical questions.
- With the 156 starter questions, the bank holds 184.

## 14. Mind maps and diagrams

Every module has:
- a mind map
- a differential table
- a flowchart with decision branches (rendered from `flow.steps`, with a "Step through" animation)
- a list of common mistakes

All diagrams are original. No coaching diagrams were copied.

## 15. Uncertainty and limitations

- **Weak observations.** All topic observations are single-source memory recall, mostly from coaching sites that sell courses. Their year and session attribution is the site's own claim.
- **Absence means nothing.** A topic missing from the data means "not in this tiny sample". It never means "not asked".
- **Unchecked medical content.** Module text, MCQs and explanations were written by Claude (AI) and have **not** been checked by a doctor. References are book names only; no page numbers or quotations were checked. You are the reviewer: use the Review queue.
- **Incomplete subject tables.** The 2025 subject table covers 195 of 200 questions. Psychiatry cannot be separated from Medicine.
- **Short attempt history.** The analytics log starts with this version. Earlier answers have no timing or error type.
- **Incomplete objectives.**
  - Learning modules exist for 14 priority topics, none in category C.
  - Image-interpretation practice for modules is text-only, because no openly licensed images were added.
  - The bank is far from the 35,000-question goal. Questions come from in-app generation or imports.

## 16. Reproducible analysis files

| File | Purpose |
|---|---|
| `pipeline/registry/sources.json`, `concepts.json`, `observations.json`, `priorities.json` | Hand-curated inputs, each with its source id. |
| `pipeline/analyze.py` | Deterministic analysis, Python standard library only. Writes `data/evidence.json`. |
| `pipeline/ingest.py` | Extracts MCQs from a file you are entitled to use (txt/md/pdf/docx/csv/json) into a review queue. Requires a rights statement. Never infers answers. |
| `pipeline/tests/test_pipeline.py` | 17 tests, including a synthetic benchmark and a check that the committed `evidence.json` matches a fresh run. |
| `tests/e2e.mjs` | 41 browser and data checks: module/evidence consistency, labels, analytics persistence, review queue, source registry, planner. |
| `build.py` | Packs `src/` and `data/` into `index.html`. |

To reproduce:

```
python3 pipeline/analyze.py
python3 -m unittest discover -s pipeline/tests
python3 build.py
node tests/e2e.mjs
```

## Validation (Objective 12)

| Check | Result |
|---|---|
| Counts against source records | 39 observations = sum of concept mentions; subject-table totals match their rows. |
| Duplicate handling | One event per exam + session + concept; tested with a synthetic two-website case. |
| Year and exam attribution | Taken from each source record; no year was inferred. INI-CET subject labels marked "(not stated)" stay that way. |
| Topic mapping | Every concept and module maps to an existing subtopic; unknown concepts or subtopics stop the pipeline. |
| Official vs reconstructed | Forecasts cannot become observations (enforced); the rejected table is excluded from priorities. |
| Calculations | Recomputed independently with a separate Wilson implementation: 0 mismatches across all non-rejected tables. Excluded counts add up (4,183 − 1,318 − 2 = 2,863; 6,150 − 1,203 − 682 = 4,265). Rounded shares sum to 100.1–100.4% (rounding only). |
| Unsupported conclusions | Removed. While building the app, the evidence page's own summary was found to say "no answer keys are published", contradicting official fact F03; it was corrected. |
| Medical references | **Not verified.** They are labelled "suggested, not verified" everywhere. |

## App changes in this phase

| Change | What it does |
|---|---|
| **Evidence** page | Every section labelled with the five evidence categories. |
| **Modules** pages | Flowchart renderer, studied-today tracking and 1/3/7/21/60-day revision. |
| **Review queue** | Queues for unreviewed, Claude-disagreed, flagged, VERIFY, imported and reviewed questions, with per-question verification details and the source registry. |
| **Analytics** page | Timed vs untimed, confidence vs accuracy, miss reasons, last 14 days, test trend. Shows honest empty states. |
| Attempt log | Monthly docs `att-<yyyymm>-<k>`. Records time per question, the "I'm guessing" toggle, test "marked for review" and an optional miss reason (7 types). |
| Adaptive spaced review | Per-question stage stored in `p-<sid>.sr`. A wrong answer resets the stage; a correct guess doesn't advance it. |
| Planner | Next 7 days, days-behind detection, "Re-plan from today" keeping the same exam date and hours, and due reviews. |
| Migration | Additive: v1 progress fields are untouched, and old answers keep the old review rule until answered again. Backups now include the attempt log and module progress. |
