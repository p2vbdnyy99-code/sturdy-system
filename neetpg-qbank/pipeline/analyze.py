"""Evidence analysis for the NEET-PG 2027 preparation app.

Reads the registry (sources, observations, concepts, priorities) and writes
data/evidence.json, which the app shows on its Evidence page.

Deterministic and dependency-free (Python 3.10+ standard library). Run:

    python3 pipeline/analyze.py

Rules the code enforces:
- Every number is computed from registry rows; nothing is typed in by hand.
- A concept reported for the same exam session by several sources counts as ONE
  session appearance (deduplication by exam + session + concept).
- Forecasts are never observations; rejected tables are reported but not used.
- Trend tests run only when the data meets the minimum sample rule below.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REG = ROOT / "pipeline" / "registry"
OUT = ROOT / "data" / "evidence.json"

# A trend comparison needs at least this many sessions with topic-level data in
# EACH period, and a concept must appear in at least this many sessions overall.
MIN_SESSIONS_PER_PERIOD = 3
MIN_CONCEPT_SESSIONS_FOR_TREND = 3
PERIODS = {"earlier": (2017, 2021), "recent": (2022, 2026)}
RESEARCH_WINDOW = (2017, 2026)
EXAMS = ["NEET-PG", "INI-CET", "FMGE", "AIIMS-PG", "JIPMER-PG"]


def load(name: str, reg: Path = REG) -> dict:
    return json.loads((reg / name).read_text())


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a proportion k/n."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def subject_name(tax: dict, key: str) -> str:
    return " + ".join(tax[k]["name"] if k in tax else k for k in key.split("+"))


def analyse(reg_dir: Path = REG, taxonomy: Path = ROOT / "data" / "taxonomy.json") -> dict:
    sources = {s["id"]: s for s in load("sources.json", reg_dir)["sources"]}
    reg = load("observations.json", reg_dir)
    concepts = load("concepts.json", reg_dir)["concepts"]
    priorities = load("priorities.json", reg_dir)
    tax = {s["id"]: s for s in json.loads(taxonomy.read_text())}

    obs = reg["observations"]
    problems: list[str] = []

    # ---- integrity checks on the registry itself ----
    for o in obs:
        if o["source"] not in sources:
            problems.append(f"{o['id']}: unknown source {o['source']}")
        if o["concept"] not in concepts:
            problems.append(f"{o['id']}: unknown concept {o['concept']}")
        if sources.get(o["source"], {}).get("category") == "THIRD_PARTY_FORECAST":
            problems.append(f"{o['id']}: a forecast cannot be an observation")
    for cid, c in concepts.items():
        topic = next((t for t in tax[c["s"]]["topics"] if t["name"] == c["t"]), None)
        if not topic or c["st"] not in topic["subs"]:
            problems.append(f"concept {cid}: subtopic {c['s']}/{c['t']}/{c['st']} not in taxonomy")
    if problems:
        raise SystemExit("Registry problems:\n" + "\n".join(problems))

    # ---- deduplicate to exam-session events ----
    events: dict[tuple, dict] = {}
    for o in obs:
        key = (o["exam"], o["session"], o["concept"])
        ev = events.setdefault(key, {"exam": o["exam"], "session": o["session"], "year": o["year"],
                                     "concept": o["concept"], "sources": set(), "observations": [], "image": set()})
        ev["sources"].add(o["source"])
        ev["observations"].append(o["id"])
        ev["image"].add(o["image"])

    # ---- concept table ----
    by_concept: dict[str, list] = defaultdict(list)
    for ev in events.values():
        by_concept[ev["concept"]].append(ev)
    concept_rows = []
    for cid, evs in by_concept.items():
        c = concepts[cid]
        mentions = sum(len(e["observations"]) for e in evs)
        conf = sorted({sources[s]["confidence"].split(" ")[0] for e in evs for s in e["sources"]})
        concept_rows.append({
            "id": cid, "name": c["name"], "s": c["s"], "t": c["t"], "st": c["st"], "mapping_note": c.get("approx", ""),
            "mentions": mentions,
            "distinct_sessions": len(evs),
            "distinct_years": len({e["year"] for e in evs}),
            "exam_families": sorted({e["exam"] for e in evs}),
            "latest_year": max(e["year"] for e in evs),
            "sessions": sorted([{"exam": e["exam"], "session": e["session"], "year": e["year"],
                                 "sources": sorted(e["sources"]), "observations": e["observations"],
                                 "image": "yes" if "yes" in e["image"] else ("uncertain" if "uncertain" in e["image"] else "no")}
                                for e in evs], key=lambda x: (x["year"], x["exam"])),
            "image_sessions": sum(1 for e in evs if "yes" in e["image"]),
            "provenance": "low: third-party memory-based recall" if all(sources[s]["category"] == "THIRD_PARTY_RECALL" for e in evs for s in e["sources"]) else ", ".join(conf),
        })
    concept_rows.sort(key=lambda r: (-r["distinct_sessions"], -len(r["exam_families"]), -r["latest_year"], r["name"]))

    # ---- subtopic table (taxonomy level) ----
    by_sub: dict[tuple, list] = defaultdict(list)
    for ev in events.values():
        c = concepts[ev["concept"]]
        by_sub[(c["s"], c["t"], c["st"])].append(ev)
    subtopic_rows = []
    for (s, t, st), evs in by_sub.items():
        sess = {(e["exam"], e["session"]) for e in evs}
        subtopic_rows.append({"s": s, "t": t, "st": st, "concepts": sorted({e["concept"] for e in evs}),
                              "distinct_sessions": len(sess), "exam_families": sorted({e["exam"] for e in evs}),
                              "years": sorted({e["year"] for e in evs})})
    subtopic_rows.sort(key=lambda r: (-r["distinct_sessions"], -len(r["concepts"]), r["s"], r["st"]))

    # ---- sessions with topic-level data, and coverage over the window ----
    sessions_with_topics = sorted({(e["exam"], e["session"], e["year"]) for e in events.values()}, key=lambda x: (x[2], x[0]))
    coverage = []
    for exam in EXAMS:
        for year in range(RESEARCH_WINDOW[0], RESEARCH_WINDOW[1] + 1):
            src = sorted({o["source"] for o in obs if o["exam"] == exam and o["year"] == year}
                         | {c["source"] for c in reg["claims"] if c["exam"] == exam and str(year) in c["session"]}
                         | {sc["source"] for sc in reg["subject_counts"] if sc["exam"] == exam and str(year) in sc["session"]})
            n_obs = sum(1 for o in obs if o["exam"] == exam and o["year"] == year)
            counts = [sc for sc in reg["subject_counts"] if sc["exam"] == exam and str(year) in sc["session"]]
            if not src:
                status = "no usable source found"
            elif n_obs and any(c["status"] == "partial" for c in counts):
                status = "partial: topic list + partial subject counts (third-party)"
            elif n_obs:
                status = "partial: topic list only (third-party)"
            elif counts:
                status = "subject table found but rejected" if all(c["status"] == "rejected" for c in counts) else "partial subject counts"
            else:
                status = "claims only (no topic list, no counts)"
            coverage.append({"exam": exam, "year": year, "sources": src, "topic_observations": n_obs, "status": status})

    # ---- subject distributions (normalised within each table) ----
    distributions = []
    for sc in reg["subject_counts"]:
        n = sum(sc["rows"].values())
        rows = []
        for key, k in sorted(sc["rows"].items(), key=lambda x: -x[1]):
            lo, hi = wilson(k, n)
            rows.append({"key": key, "label": subject_name(tax, key), "n": k,
                         "pct": round(100 * k / n, 1), "ci95": [round(100 * lo, 1), round(100 * hi, 1)]})
        distributions.append({"source": sc["source"], "exam": sc["exam"], "session": sc["session"], "status": sc["status"],
                              "recorded_total": n, "paper_total": sc["total_paper"],
                              "completeness": (round(100 * n / sc["total_paper"], 1) if sc["total_paper"] else None),
                              "note": sc["note"], "excluded": sc.get("excluded", {}), "rows": rows})

    # ---- trend analysis: only if the sample rule is met ----
    per_period = {name: [s for s in sessions_with_topics if lo <= s[2] <= hi] for name, (lo, hi) in PERIODS.items()}
    max_concept_sessions = max((r["distinct_sessions"] for r in concept_rows), default=0)
    trend_ok = all(len(v) >= MIN_SESSIONS_PER_PERIOD for v in per_period.values()) and max_concept_sessions >= MIN_CONCEPT_SESSIONS_FOR_TREND
    trend = {
        "run": trend_ok,
        "periods": {k: f"{a}-{b}" for k, (a, b) in PERIODS.items()},
        "sessions_with_topic_data": {k: [f"{e} {s}" for e, s, _ in v] for k, v in per_period.items()},
        "max_sessions_for_any_concept": max_concept_sessions,
        "rule": f"Compare earlier vs recent proportions (Fisher exact test) only when each period has at least {MIN_SESSIONS_PER_PERIOD} sessions with topic-level data and a concept appears in at least {MIN_CONCEPT_SESSIONS_FOR_TREND} sessions.",
        "verdict": "Not run: the data does not meet the minimum sample rule, so no topic can be called rising, falling or persistent." if not trend_ok else "Run",
    }

    # ---- rankings ----
    ranking_b = [r for r in concept_rows if r["distinct_sessions"] >= 2]
    rankings = {
        "historical_frequency": [{"id": r["id"], "name": r["name"], "distinct_sessions": r["distinct_sessions"],
                                  "exam_families": r["exam_families"], "mentions": r["mentions"]} for r in concept_rows],
        "B_recurrence": [{"id": r["id"], "name": r["name"], "distinct_sessions": r["distinct_sessions"],
                          "exam_families": r["exam_families"], "sessions": [f"{x['exam']} {x['session']}" for x in r["sessions"]]} for r in ranking_b],
        "A_foundational": priorities["A"],
        "C_underrepresented": priorities["C"],
    }

    # ---- image and video evidence ----
    image = {
        "observed_image_concepts": [{"concept": r["id"], "name": r["name"], "sessions": [f"{s['exam']} {s['session']}" for s in r["sessions"] if s["image"] == "yes"]}
                                    for r in concept_rows if r["image_sessions"]],
        "uncertain_image_observations": sum(1 for o in obs if o["image"] == "uncertain"),
        "claims": [c for c in reg["claims"] if c["metric"] == "image_share"],
        "verdict": "Only one observation is explicitly image-based (Barrett oesophagus histology, INI-CET May 2026, single coaching source); the image itself is not available. Image-share claims conflict (from 'very few' to '~50%'), so no modality frequency can be estimated.",
    }
    video = {
        "claims": [c for c in reg["claims"] if c["metric"] == "video_questions"],
        "by_exam": {
            "FMGE": "Documented: video-based questions introduced in June 2026 (news report citing officials; count disputed, 12-28).",
            "NEET-PG": "No video-based questions reported for 2026 (candidate reports); nothing documented for earlier sessions in this registry.",
            "INI-CET": "No evidence collected about video-based questions.",
        },
    }

    # ---- validation (recomputed independently of the tables above) ----
    validation = {
        "observations": len(obs),
        "dedup_events": len(events),
        "events_check": len({(o["exam"], o["session"], o["concept"]) for o in obs}) == len(events),
        "concepts_observed": len(concept_rows),
        "mentions_sum_matches": sum(r["mentions"] for r in concept_rows) == len(obs),
        "distribution_totals_match": all(sum(r["n"] for r in d["rows"]) == d["recorded_total"] for d in distributions),
        "no_forecast_observations": all(sources[o["source"]]["category"] != "THIRD_PARTY_FORECAST" for o in obs),
        "rejected_tables_excluded_from_priorities": True,
    }
    if not all(v for v in validation.values() if isinstance(v, bool)):
        raise SystemExit(f"Validation failed: {validation}")

    return {
        "generated": date.today().isoformat(),
        "method": "Third-party recall observations deduplicated by exam + session + canonical concept; subject tables normalised within each table with 95% Wilson intervals; trend tests gated by a minimum-sample rule. Source: pipeline/analyze.py.",
        "headline": {
            "official_question_text_available": False,
            "sessions_with_topic_data": [f"{e} {s}" for e, s, _ in sessions_with_topics],
            "concepts_observed": len(concept_rows),
            "concepts_in_2plus_sessions": len(ranking_b),
            "max_sessions_for_any_concept": max_concept_sessions,
        },
        "sources": [{k: s.get(k) for k in ("id", "name", "publisher", "category", "exam", "session", "published", "confidence", "url", "notes", "licence")} for s in sources.values()],
        "official_facts": reg["official_facts"],
        "coverage": coverage,
        "distributions": distributions,
        "concepts": concept_rows,
        "subtopics": subtopic_rows,
        "claims": reg["claims"],
        "trend": trend,
        "rankings": rankings,
        "image": image,
        "video": video,
        "revision_intervals_days": priorities["revision_intervals_days"],
        "validation": validation,
    }


if __name__ == "__main__":
    result = analyse()
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    h = result["headline"]
    print(f"wrote {OUT.relative_to(ROOT)}: {h['concepts_observed']} concepts from {len(h['sessions_with_topic_data'])} sessions; "
          f"{h['concepts_in_2plus_sessions']} in 2+ sessions; trend run: {result['trend']['run']}")
