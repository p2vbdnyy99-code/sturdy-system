"""Tests for the evidence analysis and ingestion pipeline.

Run from neetpg-qbank/:   python3 -m unittest discover -s pipeline/tests -v

The BENCHMARK below is SYNTHETIC: invented sources and observations whose correct
answers are known by construction. It exists only to check the counting rules and
is never used as evidence or shown in the app.
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import analyze  # noqa: E402
import ingest  # noqa: E402

TAX = ROOT / "data" / "taxonomy.json"


def write_registry(tmp: Path, sources, observations, subject_counts=(), claims=(), concepts=None):
    concepts = concepts or {
        "c-alpha": {"name": "Synthetic concept alpha", "s": "su", "t": "Trauma", "st": "Head injury"},
        "c-beta": {"name": "Synthetic concept beta", "s": "pa", "t": "Haematology", "st": "Leukaemias"},
    }
    (tmp / "sources.json").write_text(json.dumps({"sources": sources}))
    (tmp / "observations.json").write_text(json.dumps({"observations": observations, "subject_counts": list(subject_counts),
                                                        "claims": list(claims), "official_facts": []}))
    (tmp / "concepts.json").write_text(json.dumps({"concepts": concepts}))
    (tmp / "priorities.json").write_text(json.dumps({"A": [], "C": [], "revision_intervals_days": [1, 3, 7]}))


def src(i, category="THIRD_PARTY_RECALL"):
    return {"id": i, "name": f"Synthetic {i}", "category": category, "exam": "NEET-PG", "session": "x",
            "confidence": "low", "url": "https://example.invalid", "notes": "synthetic"}


def obs(i, source, exam, session, year, concept, image="no"):
    return {"id": i, "source": source, "exam": exam, "session": session, "year": year, "subject_label": "x",
            "label": "x", "concept": concept, "image": image}


class AnalysisRules(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_analysis(self):
        return analyze.analyse(self.tmp, TAX)

    def test_same_session_from_two_websites_counts_once(self):
        write_registry(self.tmp, [src("X1"), src("X2")], [
            obs("o1", "X1", "NEET-PG", "2025", 2025, "c-alpha"),
            obs("o2", "X2", "NEET-PG", "2025", 2025, "c-alpha"),   # same question copied by a second site
        ])
        r = self.run_analysis()
        alpha = next(c for c in r["concepts"] if c["id"] == "c-alpha")
        self.assertEqual(alpha["distinct_sessions"], 1)
        self.assertEqual(alpha["mentions"], 2)
        self.assertEqual(alpha["sessions"][0]["sources"], ["X1", "X2"])

    def test_distinct_sessions_count_separately(self):
        write_registry(self.tmp, [src("X1")], [
            obs("o1", "X1", "NEET-PG", "2024", 2024, "c-alpha"),
            obs("o2", "X1", "INI-CET", "May 2025", 2025, "c-alpha"),
            obs("o3", "X1", "NEET-PG", "2025", 2025, "c-beta"),
        ])
        r = self.run_analysis()
        alpha = next(c for c in r["concepts"] if c["id"] == "c-alpha")
        self.assertEqual((alpha["distinct_sessions"], alpha["distinct_years"]), (2, 2))
        self.assertEqual(alpha["exam_families"], ["INI-CET", "NEET-PG"])
        self.assertEqual([b["id"] for b in r["rankings"]["B_recurrence"]], ["c-alpha"])

    def test_forecast_cannot_be_an_observation(self):
        write_registry(self.tmp, [src("F1", "THIRD_PARTY_FORECAST")], [obs("o1", "F1", "NEET-PG", "2026", 2026, "c-alpha")])
        with self.assertRaises(SystemExit):
            self.run_analysis()

    def test_unknown_concept_or_subtopic_is_rejected(self):
        write_registry(self.tmp, [src("X1")], [obs("o1", "X1", "NEET-PG", "2025", 2025, "c-missing")])
        with self.assertRaises(SystemExit):
            self.run_analysis()

    def test_partial_table_reports_completeness_and_normalises(self):
        write_registry(self.tmp, [src("X1")], [obs("o1", "X1", "NEET-PG", "2025", 2025, "c-alpha")],
                       subject_counts=[{"source": "X1", "exam": "NEET-PG", "session": "2025", "total_paper": 200,
                                        "status": "partial", "note": "", "rows": {"an": 30, "su": 60, "ob": 60}}])
        d = self.run_analysis()["distributions"][0]
        self.assertEqual(d["recorded_total"], 150)
        self.assertEqual(d["completeness"], 75.0)
        self.assertEqual(sum(r["pct"] for r in d["rows"]), 100.0)
        self.assertEqual(d["status"], "partial")

    def test_trend_is_not_run_on_tiny_samples(self):
        write_registry(self.tmp, [src("X1")], [obs("o1", "X1", "NEET-PG", "2025", 2025, "c-alpha"),
                                               obs("o2", "X1", "NEET-PG", "2019", 2019, "c-alpha")])
        t = self.run_analysis()["trend"]
        self.assertFalse(t["run"])

    def test_wilson_interval_known_value(self):
        lo, hi = analyze.wilson(5, 10)
        self.assertAlmostEqual(lo, 0.2366, places=3)
        self.assertAlmostEqual(hi, 0.7634, places=3)


class RealRegistry(unittest.TestCase):
    """Checks on the committed registry and the evidence.json it produces."""

    @classmethod
    def setUpClass(cls):
        cls.r = analyze.analyse()
        cls.reg = json.loads((ROOT / "pipeline" / "registry" / "observations.json").read_text())

    def test_counts_match_source_rows(self):
        self.assertEqual(self.r["validation"]["observations"], len(self.reg["observations"]))
        self.assertEqual(sum(c["mentions"] for c in self.r["concepts"]), len(self.reg["observations"]))

    def test_rejected_table_is_labelled(self):
        dbmci = next(d for d in self.r["distributions"] if d["source"] == "S06")
        self.assertEqual(dbmci["status"], "rejected")

    def test_no_trend_claimed(self):
        self.assertFalse(self.r["trend"]["run"])

    def test_every_concept_is_low_provenance_third_party(self):
        for c in self.r["concepts"]:
            self.assertTrue(c["provenance"].startswith("low"), c["id"])

    def test_committed_evidence_is_up_to_date(self):
        committed = json.loads((ROOT / "data" / "evidence.json").read_text())
        fresh = dict(self.r); committed.pop("generated"); fresh.pop("generated")
        self.assertEqual(committed, json.loads(json.dumps(fresh)), "run python3 pipeline/analyze.py")


class Ingestion(unittest.TestCase):
    META = {"source_id": "T01", "source_name": "synthetic test file", "exam": "NEET-PG", "year": 2025,
            "session": "2025", "category": "THIRD_PARTY_RECALL", "rights": "synthetic test data"}
    TEXT = """1. A synthetic stem about an imaginary condition presenting with fever and rash?
A. Option one
B. Option two
C. Option three
D. Option four
Answer: B
Explanation: Synthetic explanation.

2. A second synthetic stem with no answer key given at all here?
(a) First
(b) Second
(c) Third
(d) Fourth

3. A synthetic stem about an imaginary condition presenting with fever and rash!
A. Option one
B. Option two
C. Option three
D. Option four
Ans: B

4. Identify the lesion shown in the image of this synthetic patient.
A. One
B. Two
C. Three
D. Four
Answer: A
"""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_text_parsing_dedup_and_review_rules(self):
        f = self.tmp / "sample.txt"; f.write_text(self.TEXT)
        res = ingest.ingest(f, dict(self.META))
        recs = {r["id"]: r for r in res["records"]}
        self.assertEqual(len(recs), 4)
        self.assertEqual(recs["T01-0001"]["answer"], "B")
        self.assertEqual(recs["T01-0001"]["status"], "extracted")
        self.assertIsNone(recs["T01-0002"]["answer"])                      # never inferred
        self.assertEqual(recs["T01-0002"]["status"], "needs_review")
        self.assertEqual(recs["T01-0003"]["duplicate_of"], "T01-0001")    # same question, punctuation differs
        self.assertTrue(recs["T01-0004"]["image_reference"])               # image mentioned but not present
        self.assertTrue(all(not r["counts_as_exam_evidence"] for r in recs.values()))
        rep = res["report"]
        self.assertEqual((rep["missing_answers"], rep["duplicate_candidates"]), (1, 1))

    def test_ai_generated_import_is_never_evidence(self):
        f = self.tmp / "ai.json"
        f.write_text(json.dumps([{"question": "A synthetic AI-written stem long enough to parse?", "options": ["a", "b", "c", "d"], "answer": "A"}]))
        res = ingest.ingest(f, {**self.META, "category": "AI_GENERATED"})
        rec = res["records"][0]
        self.assertFalse(rec["counts_as_exam_evidence"])
        self.assertFalse(rec["eligible_for_evidence_after_review"])

    def test_rights_statement_required(self):
        f = self.tmp / "x.txt"; f.write_text(self.TEXT)
        with self.assertRaises(ValueError):
            ingest.ingest(f, {**self.META, "rights": ""})

    def test_docx_and_csv(self):
        import docx
        d = docx.Document()
        for line in self.TEXT.splitlines()[:7]:
            d.add_paragraph(line)
        p = self.tmp / "s.docx"; d.save(p)
        self.assertEqual(ingest.ingest(p, dict(self.META))["records"][0]["answer"], "B")
        c = self.tmp / "s.csv"
        c.write_text("question,a,b,c,d,answer\nA synthetic CSV stem that is long enough?,w,x,y,z,C\n")
        self.assertEqual(ingest.ingest(c, dict(self.META))["records"][0]["answer"], "C")

    def test_existing_records_are_checked_for_duplicates(self):
        f = self.tmp / "s.txt"; f.write_text(self.TEXT)
        first = ingest.ingest(f, dict(self.META))["records"]
        second = ingest.ingest(f, {**self.META, "source_id": "T02"}, existing=first)["records"]
        self.assertTrue(all(r["duplicate_of"] for r in second))


if __name__ == "__main__":
    unittest.main()
