#!/usr/bin/env python3
"""Filter jobs_last24h.csv down to SWE / AI-ML / data / cloud roles in the US, newest first.

Usage: python shortlist.py [--in jobs_last24h.csv] [--out jobs_shortlist.csv] [--hours 48]
"""
import argparse, csv, re
from datetime import datetime, timedelta, timezone

INCLUDE = re.compile(r"\b(software|swe|sde|developer|engineer(ing)?|machine learning|\bml\b|\bai\b|artificial intelligence|"
                     r"llm|genai|generative|data scien|data engineer|mlops|backend|back-end|full[ -]?stack|platform|"
                     r"cloud|devops|site reliability|\bsre\b|applied scien|research engineer|python)\b", re.I)
EXCLUDE = re.compile(r"\b(intern|internship|co-?op|apprentice|director|vice president|\bvp\b|head of|chief|"
                     r"principal|distinguished|fellow|manager|recruit|sales|account (executive|manager)|"
                     r"mechanical|electrical|civil|hardware|technician|field service|nurse|clerk|driver|"
                     r"warehouse|store|retail|customer service)\b", re.I)
AI = re.compile(r"\b(machine learning|\bml\b|\bai\b|llm|genai|generative|applied scien|mlops|nlp|computer vision|deep learning)\b", re.I)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="jobs_last24h.csv")
    ap.add_argument("--out", default="jobs_shortlist.csv")
    ap.add_argument("--hours", type=float, default=48, help="keep jobs posted within this many hours (rows without a date are kept)")
    a = ap.parse_args()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=a.hours)
    rows = list(csv.DictReader(open(a.inp, encoding="utf-8")))
    out, seen = [], set()
    for r in rows:
        t = r.get("title", "")
        if not INCLUDE.search(t) or EXCLUDE.search(t):
            continue
        c = (r.get("country") or "").lower()
        if c and "united states" not in c:
            continue
        p = r.get("posted_at") or ""
        if p:
            try:
                if datetime.fromisoformat(p.replace("Z", "+00:00")) < cutoff:
                    continue
            except ValueError:
                pass
        k = (r["company"], r.get("job_id") or r.get("url"))
        if k in seen:
            continue
        seen.add(k)
        r["track"] = "AI/ML" if AI.search(t) else "SWE/Data/Cloud"
        out.append(r)
    out.sort(key=lambda r: (r["track"] != "AI/ML", -(datetime.fromisoformat(r["posted_at"].replace("Z", "+00:00")).timestamp()
                                                       if r.get("posted_at") else 0)))
    cols = ["track", "company", "title", "location", "posted_at", "url"]
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(out)
    ai = sum(1 for r in out if r["track"] == "AI/ML")
    print(f"{len(rows)} jobs in -> {len(out)} shortlisted ({ai} AI/ML, {len(out)-ai} SWE/Data/Cloud) -> {a.out}")

if __name__ == "__main__":
    main()
