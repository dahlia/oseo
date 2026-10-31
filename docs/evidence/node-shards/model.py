"""Derive Node shard weights and model ordinary Node job walls.

Usage: python3 model.py [--emit]

Reads node-file-costs.tsv beside this script and the checkout's Node test
discovery. Weights are the largest of the three runs' per-file sums,
rounded up to whole seconds. Files postdating the runs take a local
measurement scaled by the residual-evidence calibration below. The model
replays Node's runner: a job's files start in sorted path order, each on
the first free of `width` workers (Linux 3, macOS 2: the hosted runners'
available parallelism minus one), and a job adds one minute of setup.
With --emit it prints the weight tables for tools/node-shard-costs.ts.
"""

import csv
import math
import statistics
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARRAY = "tests/property/m5-array-constructor.property.test.ts"
RESIDUAL = "tests/dynamic-source-residual-evidence.test.ts"
WIDTH = {"linux": 3, "macos": 2}
TOTAL = {"linux": 4, "macos": 6}
THRESHOLD = 30
SETUP = 60

# Local sums from one serial run on the development host (2026-11-01).
LOCAL_RESIDUAL = 798.3
LOCAL = {
    "tests/host-script-evidence.test.ts": 290.8,
    "tests/trainc-ordinary-evidence.test.ts": 155.2,
    "tests/unhandled-rejection-policy-native.test.ts": 9.5,
}
# Coming files with local estimates from their lanes' handoffs: train C
# evidence (one file, or the three pieces the split would produce) and the
# exhaustive RegExp literal property.
TRAINC = 1140.0
REGEXP = ("tests/property/m5-regexp-literal-exhaustive.property.test.ts", 248.0)
# Job walls in seconds (started_at to completed_at) for model validation.
WALLS = {
    "linux-41228695658": [2264, 2470],
    "linux-41233967056": [1834, 3200],
    "linux-41238903460": [2244, 3360],
    "macos-41228695658": [993, 557, 2327, 1840],
    "macos-41233967056": [1278, 1575, 2563, 2372],
    "macos-41238903460": [1029, 1233, 2467, 2407],
}
COMMITS = {
    "41228695658": "9f21b607aef9399cc2a1f61d382f535af5161a2e",
    "41233967056": "636157efd",
    "41238903460": "8770b2e4ee0ffd1d4ebe97450da39689eb85238d",
}


def discover(commit="HEAD"):
    # Importing the sibling script must not leave bytecode in the tree.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(HERE))
    from extract import discover as tracked

    return tracked(commit)


def load():
    with open(HERE / "node-file-costs.tsv") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    return rows


def wall(files, weight, width):
    workers = [0.0] * width
    for path in sorted(files):
        index = workers.index(min(workers))
        workers[index] += weight(path)
    return max(workers) + SETUP


def select(pool, total, weight, width):
    """The greedy assignment tools/node-shard.ts implements."""
    shards = [[] for _ in range(total)]
    for path in sorted(pool, key=lambda p: (-weight(p), p)):
        best = min(
            range(total),
            key=lambda i: (wall(shards[i] + [path], weight, width), i),
        )
        shards[best].append(path)
    return shards


def main(emit):
    rows = load()
    ratio = {}
    tables, fallbacks, sums = {}, {}, {}
    for host in ("linux", "macos"):
        columns = [c for c in rows[0] if c.startswith(host)]
        sums[host] = {
            r["path"]: {c: float(r[c]) for c in columns if r[c] != ""}
            for r in rows
        }
        largest = {p: max(v.values()) for p, v in sums[host].items() if v}
        ratio[host] = largest[RESIDUAL] / LOCAL_RESIDUAL
        for path, seconds in LOCAL.items():
            largest[path] = seconds * ratio[host]
        weights = {p: math.ceil(v) for p, v in largest.items()}
        fallbacks[host] = round(statistics.median(weights.values()))
        tables[host] = {p: w for p, w in weights.items() if w >= THRESHOLD}
    if emit:
        for host in ("linux", "macos"):
            print(f"// {host}: fallback {fallbacks[host]}")
            for path, seconds in sorted(tables[host].items()):
                print(f'    "{path}": {seconds},')
        return
    for host in ("linux", "macos"):
        print(f"{host}: CI/local residual ratio {ratio[host]:.3f}, "
              f"{len(tables[host])} weights >= {THRESHOLD} s, "
              f"fallback {fallbacks[host]} s")
    print("\nValidation: Node's positional --test-shard at each run's commit")
    for key, walls in WALLS.items():
        host, run = key.split("-")
        files = discover(COMMITS[run])
        pool = [p for p in files if host == "linux" or p != ARRAY]
        total = len(walls)
        observed = {p: v.get(key) for p, v in sums[host].items()}
        modeled = []
        for index in range(total):
            mine = [p for k, p in enumerate(pool) if k % total == index]
            modeled.append(wall(mine, lambda p: observed.get(p) or 0,
                                WIDTH[host]))
        print(f"  {key}: actual "
              + " ".join(f"{w / 60:5.1f}" for w in walls)
              + " | model " + " ".join(f"{m / 60:5.1f}" for m in modeled))
    print("\nCost-aware shards on HEAD (minutes; weights, then largest sums)")
    files = discover()
    for host in ("linux", "macos"):
        table, fallback = tables[host], fallbacks[host]
        weight = lambda p: table.get(p, fallback)
        largest = {p: max(v.values()) for p, v in sums[host].items() if v}
        for path, seconds in LOCAL.items():
            largest[path] = seconds * ratio[host]
        pool = [p for p in files if host == "linux" or p != ARRAY]
        for total in sorted({TOTAL[host] - 1, TOTAL[host]}):
            shards = select(pool, total, weight, WIDTH[host])
            truth = lambda p: largest.get(p, fallback)
            print(f"  {host} {total}: weights "
                  + " ".join(f"{wall(s, weight, WIDTH[host]) / 60:5.1f}"
                             for s in shards)
                  + " | sums "
                  + " ".join(f"{wall(s, truth, WIDTH[host]) / 60:5.1f}"
                             for s in shards))

    print("\nComing files on HEAD (minutes of largest sums)")
    pieces = [f"tests/host-script-trainc-evidence-{i}.test.ts" for i in (1, 2, 3)]
    scenarios = [
        ("whole, unweighted", {"tests/host-script-trainc-evidence.test.ts":
                               TRAINC}, False),
        ("split, unweighted", {p: TRAINC / 3 for p in pieces}, False),
        ("split, weighted", {p: TRAINC / 3 for p in pieces}, True),
    ]
    for host in ("linux", "macos"):
        largest = {p: max(v.values()) for p, v in sums[host].items() if v}
        for path, seconds in LOCAL.items():
            largest[path] = seconds * ratio[host]
        for label, extra, weighted in scenarios:
            coming = {**extra, REGEXP[0]: REGEXP[1]}
            table = dict(tables[host])
            if weighted:
                table.update({p: math.ceil(v * ratio[host])
                              for p, v in coming.items()})
            truth = dict(largest)
            truth.update({p: v * ratio[host] for p, v in coming.items()})
            fallback = fallbacks[host]
            pool = [p for p in sorted(set(files) | set(coming))
                    if host == "linux" or p != ARRAY]
            shards = select(pool, TOTAL[host],
                            lambda p: table.get(p, fallback), WIDTH[host])
            print(f"  {host} {TOTAL[host]} train C {label}: "
                  + " ".join(f"{wall(s, lambda p: truth.get(p, fallback), WIDTH[host]) / 60:5.1f}"
                             for s in shards))


if __name__ == "__main__":
    main("--emit" in sys.argv[1:])
