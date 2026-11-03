"""Time the base and current builds of each benchmark in alternating order.

Usage: python3 time.py ROUNDS, from the directory that build.sh filled.
Prints medians, minimums, and the median change per benchmark as JSON.
"""

import json
import statistics
import subprocess
import sys
import time

BENCHES = ["sloppy-calls", "strict-calls", "builtin-callbacks"]


def main() -> None:
    rounds = int(sys.argv[1])
    samples = {bench: {"base": [], "cur": []} for bench in BENCHES}
    for round_index in range(rounds):
        for bench in BENCHES:
            order = ("base", "cur") if round_index % 2 == 0 else ("cur", "base")
            for variant in order:
                start = time.perf_counter()
                subprocess.run(
                    [f"./{bench}.{variant}"],
                    stdout=subprocess.DEVNULL,
                    check=True,
                )
                samples[bench][variant].append(time.perf_counter() - start)
    result = {}
    for bench in BENCHES:
        base = samples[bench]["base"]
        cur = samples[bench]["cur"]
        result[bench] = {
            "base_median_s": round(statistics.median(base), 4),
            "current_median_s": round(statistics.median(cur), 4),
            "change_percent": round(
                (statistics.median(cur) / statistics.median(base) - 1) * 100, 2
            ),
            "base_min_s": round(min(base), 4),
            "current_min_s": round(min(cur), 4),
        }
    print(json.dumps(result, indent=1))


main()
