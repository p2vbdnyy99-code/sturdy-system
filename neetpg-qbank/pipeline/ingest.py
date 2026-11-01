"""Ingest MCQs from a document you are entitled to use, into a review queue.

    python3 pipeline/ingest.py FILE --source-id S19 --source-name "My recall book" \
        --exam NEET-PG --year 2025 --session 2025 \
        --category THIRD_PARTY_RECALL --rights "personal study copy; no redistribution"

Supported: .txt .md .pdf .docx .csv .json
- CSV columns: question, a, b, c, d, answer (A-D or blank), explanation (optional)
- JSON: list of {question, options:[4], answer?: "A"-"D", explanation?}

What it does NOT do:
- It never guesses a missing answer; such records go to review.
- It never publishes; every record starts as needs_review or extracted, and
  only a human review step can make a record count as exam evidence.
- It does not OCR images or scanned PDFs (pages with no text are reported).

Outputs pipeline/out/<source-id>.records.json (question content),
pipeline/out/<source-id>.provenance.json (kept separate) and a report.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
MAX_BYTES = 50 * 1024 * 1024
CATEGORIES = {"OFFICIAL_RELEASED", "VERIFIED_RECONSTRUCTION", "LICENSED_QUESTION", "THIRD_PARTY_RECALL",
              "INDEPENDENTLY_AUTHORED", "AI_GENERATED", "IMPORTED_UNVERIFIED"}
# Only these categories can ever become exam evidence, and only after human review.
EVIDENCE_CATEGORIES = {"OFFICIAL_RELEASED", "VERIFIED_RECONSTRUCTION", "THIRD_PARTY_RECALL"}
IMAGE_WORDS = re.compile(r"\b(image|picture|photograph|shown|figure|x-?ray shown|identify the (lesion|instrument|structure)|ecg shown|given (image|photo))\b", re.I)

Q_START = re.compile(r"^\s*(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,4})\s*[\.\):]\s+(.*\S)\s*$", re.I)
OPT = re.compile(r"^\s*\(?([A-Da-d])\s*[\.\):]\s+(.*\S)\s*$")
ANS = re.compile(r"^\s*(?:Ans(?:wer)?|Correct(?: answer)?|Key)\s*[:\-\.]?\s*\(?([A-Da-d])\)?\b", re.I)
EXP = re.compile(r"^\s*(?:Explanation|Exp|Solution)\s*[:\-\.]\s*(.*)$", re.I)


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", re.sub(r"\s+", " ", text.lower())).strip()


def shingles(text: str, k: int = 3) -> set[str]:
    words = norm(text).split()
    return {" ".join(words[i:i + k]) for i in range(max(1, len(words) - k + 1))}


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def read_pages(path: Path) -> list[tuple[int | None, str]]:
    """Return (page number or None, text) chunks."""
    ext = path.suffix.lower()
    if ext in {".txt", ".md"}:
        return [(None, path.read_text(errors="replace"))]
    if ext == ".pdf":
        from pypdf import PdfReader
        return [(i + 1, page.extract_text() or "") for i, page in enumerate(PdfReader(str(path)).pages)]
    if ext == ".docx":
        import docx
        return [(None, "\n".join(p.text for p in docx.Document(str(path)).paragraphs))]
    raise ValueError(f"unsupported text format: {ext}")


def parse_text(pages: list[tuple[int | None, str]]) -> list[dict]:
    """Detect numbered stems, A-D options, answer and explanation lines."""
    items, cur, field = [], None, None
    for page, text in pages:
        for line in text.splitlines():
            if not line.strip():
                continue
            m_ans, m_opt, m_q, m_exp = ANS.match(line), OPT.match(line), Q_START.match(line), EXP.match(line)
            if m_ans and cur:
                cur["answer"] = m_ans.group(1).upper(); field = None
            elif m_exp and cur:
                cur["explanation"] = m_exp.group(1); field = "explanation"
            elif m_opt and cur and len(cur["options"]) < 4 and m_opt.group(1).upper() == "ABCD"[len(cur["options"])]:
                cur["options"].append(m_opt.group(2)); field = "option"
            elif m_q:
                if cur: items.append(cur)
                cur = {"number": int(m_q.group(1)), "question": m_q.group(2), "options": [], "answer": None,
                       "explanation": "", "page": page}
                field = "question"
            elif cur and field == "question" and not cur["options"]:
                cur["question"] += " " + line.strip()
            elif cur and field == "explanation":
                cur["explanation"] += " " + line.strip()
            elif cur and field == "option" and cur["options"]:
                cur["options"][-1] += " " + line.strip()
    if cur: items.append(cur)
    return items


def parse_structured(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8") as f:
            return [{"number": i + 1, "question": r.get("question", ""), "options": [r.get(k, "") for k in "abcd"],
                     "answer": (r.get("answer") or "").strip().upper() or None, "explanation": r.get("explanation", ""), "page": None}
                    for i, r in enumerate(csv.DictReader(f))]
    data = json.loads(path.read_text())
    return [{"number": i + 1, "question": r.get("question", ""), "options": list(r.get("options", [])),
             "answer": (r.get("answer") or "").strip().upper() or None, "explanation": r.get("explanation", ""), "page": None}
            for i, r in enumerate(data)]


def score(item: dict) -> tuple[float, list[str]]:
    """Extraction confidence from structural completeness (not medical accuracy)."""
    issues, s = [], 1.0
    if len(item["question"]) < 15: issues.append("very short stem"); s -= 0.3
    if len(item["options"]) != 4: issues.append(f"{len(item['options'])} options found"); s -= 0.4
    if any(len(o.strip()) == 0 for o in item["options"]): issues.append("empty option"); s -= 0.2
    if item["answer"] not in {"A", "B", "C", "D"}: issues.append("answer missing (not inferred)"); s -= 0.3
    if re.search(r"[^\x00-\x7FÀ-ɏ‐-‧°±µ×÷→]{3,}", item["question"]): issues.append("possible OCR noise"); s -= 0.1
    return max(0.0, round(s, 2)), issues


def ingest(path: Path, meta: dict, existing: list[dict] | None = None) -> dict:
    if meta["category"] not in CATEGORIES:
        raise ValueError(f"category must be one of {sorted(CATEGORIES)}")
    if not meta.get("rights"):
        raise ValueError("--rights is required: state why you may use this file")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("file larger than 50 MB")
    errors, empty_pages = [], []
    if path.suffix.lower() in {".csv", ".json"}:
        raw = parse_structured(path)
    else:
        pages = read_pages(path)
        empty_pages = [p for p, t in pages if p is not None and not t.strip()]
        raw = parse_text(pages)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    prov_id = f"P-{meta['source_id']}"
    existing = existing or []
    pool = [(e["id"], shingles(e["question"]), norm(e["question"])) for e in existing]
    records, groups = [], {}
    for item in raw:
        conf, issues = score(item)
        qnorm, qsh = norm(item["question"]), shingles(item["question"])
        dup_of, kind = None, None
        for other_id, other_sh, other_norm in pool:
            if qnorm and qnorm == other_norm:
                dup_of, kind = other_id, "exact"; break
            if jaccard(qsh, other_sh) >= 0.8:
                dup_of, kind = other_id, "near"; break
        rid = f"{meta['source_id']}-{item['number']:04d}"
        if dup_of:
            groups.setdefault(dup_of, []).append(rid)
        image_ref = bool(IMAGE_WORDS.search(item["question"]))
        if image_ref:
            issues.append("mentions an image that is not in the file")
        status = "needs_review" if (conf < 0.9 or dup_of or image_ref or item["answer"] is None) else "extracted"
        rec = {"id": rid, "question": item["question"], "options": item["options"], "answer": item["answer"],
               "explanation": item["explanation"].strip(), "page": item["page"], "provenance": prov_id,
               "extraction_confidence": conf, "issues": issues, "image_reference": image_ref,
               "duplicate_of": dup_of, "duplicate_kind": kind, "status": status,
               "counts_as_exam_evidence": False,
               "eligible_for_evidence_after_review": meta["category"] in EVIDENCE_CATEGORIES}
        records.append(rec)
        pool.append((rid, qsh, qnorm))
    provenance = {"id": prov_id, "source_id": meta["source_id"], "source_name": meta.get("source_name", ""),
                  "file": path.name, "sha256": digest, "exam": meta.get("exam"), "year": meta.get("year"),
                  "session": meta.get("session"), "category": meta["category"], "rights": meta["rights"],
                  "year_attribution": "as stated by the importer; unverified" if meta.get("year") else "uncertain",
                  "ingested": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    report = {"documents_processed": 1, "questions_extracted": len(records),
              "records_rejected": sum(1 for r in records if r["extraction_confidence"] < 0.3),
              "records_requiring_review": sum(1 for r in records if r["status"] == "needs_review"),
              "duplicate_candidates": sum(1 for r in records if r["duplicate_of"]),
              "missing_answers": sum(1 for r in records if r["answer"] is None),
              "image_references_without_image": sum(1 for r in records if r["image_reference"]),
              "mean_extraction_confidence": round(sum(r["extraction_confidence"] for r in records) / len(records), 2) if records else None,
              "pages_without_text": empty_pages, "rights": meta["rights"], "errors": errors}
    return {"records": records, "provenance": provenance, "duplicate_groups": groups, "report": report}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path)
    for name in ("--source-id", "--category", "--rights"):
        ap.add_argument(name, required=True)
    for name in ("--source-name", "--exam", "--session"):
        ap.add_argument(name, default="")
    ap.add_argument("--year", type=int)
    a = ap.parse_args(argv)
    OUT.mkdir(exist_ok=True)
    existing = [r for f in OUT.glob("*.records.json") if not f.name.startswith(a.source_id + ".") for r in json.loads(f.read_text())]
    res = ingest(a.file, {"source_id": a.source_id, "source_name": a.source_name, "exam": a.exam, "year": a.year,
                          "session": a.session, "category": a.category, "rights": a.rights}, existing)
    (OUT / f"{a.source_id}.records.json").write_text(json.dumps(res["records"], ensure_ascii=False, indent=1))
    (OUT / f"{a.source_id}.provenance.json").write_text(json.dumps(res["provenance"], ensure_ascii=False, indent=1))
    (OUT / f"{a.source_id}.report.json").write_text(json.dumps({**res["report"], "duplicate_groups": res["duplicate_groups"]}, indent=1))
    print(json.dumps(res["report"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
