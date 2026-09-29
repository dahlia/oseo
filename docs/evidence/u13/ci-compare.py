"""Compare two CI runs' test262 job and execution-step seconds.

Usage:
    gh run view RUN --repo dahlia/oseo --json headSha,jobs > run.json
    python3 ci-compare.py base.json branch.json

Job seconds come from each job's measured startedAt and completedAt; the
execution-step seconds come from the step named
`Run mise run test:test262 --shard N/TOTAL`, which excludes job setup and
cleanup. Both runs must use the same shard total. Every number printed is
measured from the run API except the differences and percentages, which are
derived.
"""

import json
import sys
from datetime import datetime


def seconds(started, completed):
    if started is None or completed is None:
        return None
    parse = datetime.fromisoformat
    return (parse(completed) - parse(started)).total_seconds()


def collect(path):
    document = json.load(open(path, encoding="utf8"))
    shards = {}
    for job in document["jobs"]:
        if not job["name"].startswith("test262"):
            continue
        name = job["name"]
        inside = name[name.index("(") + 1 : name.rindex(")")]
        target, shard = (part.strip() for part in inside.split(","))
        host = "macOS" if target.startswith("macos") else "Linux"
        prefix = "Run mise run test:test262"
        step = next(
            (s for s in job["steps"] if s["name"].startswith(prefix)),
            None,
        )
        shards[(host, shard)] = {
            "conclusion": job["conclusion"],
            "job": seconds(job.get("startedAt"), job.get("completedAt")),
            "step": (
                None
                if step is None
                else seconds(step.get("startedAt"), step.get("completedAt"))
            ),
        }
    return document["headSha"], shards


baseSha, base = collect(sys.argv[1])
headSha, head = collect(sys.argv[2])
print(f"base {baseSha}")
print(f"head {headSha}")
print()
print(
    f"{'host':>6} {'shard':>6} {'base job s':>11} {'head job s':>11} "
    f"{'base step s':>12} {'head step s':>12} {'step diff':>10}"
)
totals = {}
for key in sorted(set(base) | set(head)):
    b, h = base.get(key), head.get(key)
    if b is None or h is None:
        print(f"{key[0]:>6} {key[1]:>6} missing in one run")
        continue
    diff = (
        ""
        if b["step"] is None or h["step"] is None
        else f"{(h['step'] - b['step']) / b['step'] * 100:+9.1f}%"
    )
    print(f"{key[0]:>6} {key[1]:>6} {b['job']:11.0f} {h['job']:11.0f} "
          f"{b['step'] or 0:12.0f} {h['step'] or 0:12.0f} {diff:>10}")
    entry = totals.setdefault(key[0], [0.0, 0.0, 0.0, 0.0, 0])
    entry[0] += b["job"]
    entry[1] += h["job"]
    entry[2] += b["step"] or 0
    entry[3] += h["step"] or 0
    entry[4] += 1
print()
for host, (bj, hj, bs, hs, n) in sorted(totals.items()):
    print(f"{host}: {n} shards; job sum {bj:.0f} -> {hj:.0f} s "
          f"({(hj - bj) / bj * 100:+.1f}%); step sum {bs:.0f} -> {hs:.0f} s "
          f"({(hs - bs) / bs * 100:+.1f}%); step saving {bs - hs:.0f} s "
          f"({(bs - hs) / 60:.1f} min)")
print()
for path, label in ((sys.argv[1], "base"), (sys.argv[2], "head")):
    document = json.load(open(path, encoding="utf8"))
    families = {}
    for job in document["jobs"]:
        family = job["name"].split("(")[0].strip()
        host = "macOS" if "macos" in job["name"] else "Linux"
        if job["name"].startswith("check"):
            host = "Linux"
        elapsed = seconds(job.get("startedAt"), job.get("completedAt"))
        if elapsed is None:
            continue
        entry = families.setdefault((host, family), [0.0, 0])
        entry[0] += elapsed
        entry[1] += 1
    print(f"{label} family job-minute sums:")
    for (host, family), (total, count) in sorted(families.items()):
        print(f"  {host:>6} {family:<18} {count:>2} jobs {total / 60:8.2f} min")
