#!/usr/bin/env python3
"""Recompute the U4 local timing table and its derived figures.

Reads only the preserved evidence in this directory: the two compact shard
logs and the object byte measurement. Prints the wall-time table the baseline
shows, the cold-minus-warm differences it derives before rounding, the
per-object rates it applies, and the byte projections that rest on them.

    python3 docs/evidence/u4/summarize.py
"""

import decimal
import pathlib
import re

HERE = pathlib.Path(__file__).parent


def half_up(value, places):
    """Round away from zero at a tie, as the baseline's tables do."""
    quantum = decimal.Decimal(1).scaleb(-places)
    return decimal.Decimal(value).quantize(
        quantum, rounding=decimal.ROUND_HALF_UP
    )

# Object counts measured from CI job logs for the ten macOS test262 shards at
# total 10; the baseline sources them separately from these local runs.
SHARD_OBJECT_COUNTS = (96, 96, 116, 128, 128, 108, 109, 112, 116, 108)
# Upstream signature ceiling for one shard, from the baseline's scan.
SHARD_OBJECT_CEILING = 300
# The baseline's historical input-stability proportion, applied as an
# assumed hit rate. It is not an observed cache hit rate.
ASSUMED_HIT_RATE = 51 / 79

RUN = re.compile(
    r"^== (?P<label>\S+)\.log$\n"
    r"^=== \S+ shard=(?P<shard>\S+) harness=(?P<mode>cold|warm) "
    r"(?:cpus=(?P<cpus>\S+) )?start (?P<start>\S+)$\n"
    r'^test262-builds .*"objectsBuilt":(?P<built>\d+),'
    r'"objectsReused":(?P<reused>\d+)\}$\n'
    r"^test262 revision=(?P<revision>\S+) target=(?P<target>\S+) "
    r"tests=(?P<tests>\S+) .*pool=(?P<pool>\d+) \S+$\n"
    r"^Finished in (?P<finished>\S+)s$\n"
    r"^WALL (?P<wall>[\d.]+) s$",
    re.MULTILINE,
)


def parse(path):
    """Yield one record per run in a compact shard log."""
    text = path.read_text()
    runs = [match.groupdict() for match in RUN.finditer(text)]
    expected = text.count("\n== ")
    if len(runs) != expected:
        raise SystemExit(f"{path.name}: matched {len(runs)} of {expected} runs")
    for run in runs:
        run["wall"] = decimal.Decimal(run["wall"])
        run["built"] = int(run["built"])
        run["reused"] = int(run["reused"])
        run["pool"] = int(run["pool"])
        run["source"] = path.name
    return runs


def check_invariants(runs):
    """Fail if a run contradicts what the baseline says every run shares."""
    for run in runs:
        if run["shard"] != "1/10" or run["tests"] != "2139/21383":
            raise SystemExit(f"{run['label']}: unexpected shard selection")
        if run["mode"] == "cold" and (run["built"], run["reused"]) != (96, 0):
            raise SystemExit(f"{run['label']}: cold run did not build 96")
        if run["mode"] == "warm" and (run["built"], run["reused"]) != (0, 96):
            raise SystemExit(f"{run['label']}: warm run did not reuse 96")


def series(runs, target, pool, mode):
    """Wall seconds of the table runs for one host, pool, and cache state."""
    return [
        run["wall"]
        for run in runs
        if run["target"] == target
        and run["pool"] == pool
        and run["mode"] == mode
        and not run["label"].endswith("warmup")
    ]


def main():
    runs = parse(HERE / "linux-timings.log") + parse(
        HERE / "macos-timings.log"
    )
    check_invariants(runs)
    k = runs[0]["built"]

    print("Warm-up runs, excluded from the table:")
    for run in runs:
        if run["label"].endswith("warmup"):
            print(
                f"  {run['target']:<16} pool={run['pool']} "
                f"{run['mode']:<4} {run['wall']:>7.2f} s  {run['source']}"
            )

    print("\nHost             Pool Cache Wall seconds              Mean")
    rows = {}
    for target in ("linux-x86_64-gnu", "macos-aarch64"):
        for pool in (8, 3):
            for mode in ("cold", "warm"):
                walls = series(runs, target, pool, mode)
                if not walls:
                    continue
                rows[(target, pool, mode)] = sum(walls) / len(walls)
                values = ", ".join(f"{half_up(wall, 2)}" for wall in walls)
                print(
                    f"{target:<16} {pool:>4} {mode:<5} {values:<25} "
                    f"{half_up(rows[(target, pool, mode)], 2)}"
                )

    print("\nCold minus warm, before rounding:")
    savings = {}
    for target in ("linux-x86_64-gnu", "macos-aarch64"):
        for pool in (8, 3):
            if (target, pool, "cold") not in rows:
                continue
            delta = rows[(target, pool, "cold")] - rows[(target, pool, "warm")]
            savings[(target, pool)] = delta
            print(
                f"  {target:<16} pool={pool}  "
                f"{half_up(delta, 2):>+8} s  "
                f"{half_up(delta / k, 3):+} s per object"
            )

    warm3 = series(runs, "linux-x86_64-gnu", 3, "warm")
    print(
        f"\nLinux pool 3 warm spread: {half_up(max(warm3) - min(warm3), 2)}"
        f" s over {len(warm3)} runs"
    )
    mac3 = [
        run["wall"]
        for run in runs
        if run["target"] == "macos-aarch64" and run["pool"] == 3
    ]
    print(
        f"macOS pool 3 spread:      {max(mac3) - min(mac3):.0f} s over "
        f"{len(mac3)} runs, in start order "
        + ", ".join(f"{half_up(wall, 0)}" for wall in mac3)
    )

    rate = max(savings.values()) / k
    total = sum(SHARD_OBJECT_COUNTS)
    print(
        f"\nLargest per-object saving: {half_up(rate, 3)} s, from the one"
    )
    print("positive macOS pair; two of the four configurations gave none.")
    print(
        f"  current workload:   {total} objects -> "
        f"{half_up(total * rate, 0)} s = {half_up(total * rate / 60, 1)} min"
    )
    print(
        f"  at the assumed hit rate {half_up(ASSUMED_HIT_RATE, 3)}: "
        f"{half_up(total * rate * decimal.Decimal(ASSUMED_HIT_RATE) / 60, 1)}"
        f" min"
    )
    bound = SHARD_OBJECT_CEILING * len(SHARD_OBJECT_COUNTS)
    print(
        f"  projected bound:    {bound} objects -> "
        f"{half_up(bound * rate, 0)} s = {half_up(bound * rate / 60, 1)} min"
    )

    sizes = (HERE / "object-sizes.log").read_text()
    compressed = int(re.search(r"zstd3 bytes=(\d+)", sizes).group(1))
    measured = int(re.search(r"n=96 total=(\d+)", sizes).group(1))
    mib = 1048576
    largest = max(SHARD_OBJECT_COUNTS)
    print(
        f"\nObject bytes: {measured / mib:.1f} MiB raw, "
        f"{compressed / mib:.1f} MiB compressed, for {k} objects"
    )
    print(
        f"  largest shard, {largest} objects: "
        f"{compressed / mib * largest / k:.0f} MiB "
        f"= {compressed * largest / k / 10**6:.1f} MB"
    )
    print(
        f"  ten shards on two targets, {total * 2} objects: "
        f"{compressed / mib * total / k * 2:.0f} MiB "
        f"= {compressed * total / k * 2 / 10**6:.0f} MB"
    )
    print(
        "  MiB divides by 1048576, as the preserved commands do; MB by 10^6,"
    )
    print("  the unit of the restore rate the baseline applies to them.")


main()
