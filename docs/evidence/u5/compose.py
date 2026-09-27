#!/usr/bin/env python3
"""Classify a Zig global cache's o/ entries by the object each one holds.

Separates the per-case entries, whose inputs carry a per-run staging path,
from the target-constant libraries and the C startup and libc objects, whose
inputs do not. Prints each class's exact byte total, so the classification is
a measurement rather than a sum of rounded rows. Usage:

    python3 docs/evidence/u5/compose.py "$ZIG_GLOBAL_CACHE_DIR"
"""

import collections
import os
import sys

PER_CASE = ("case.o", "launcher.o", "generated.o", "harness.o")
CONSTANT_PREFIXES = (
    "libcompiler_rt",
    "libubsan",
    "libtsan",
    "libunwind",
    "libclang_rt",
)


def classify(names):
    """Name the class an o/ entry belongs to, from the files it holds."""
    for name in PER_CASE:
        if name in names:
            return f"per-case {name}"
    if any(n.startswith("agent-") for n in names):
        return "agent objects"
    if any(n.startswith("runtime_") or n == "oseo_runtime.o" for n in names):
        return "runtime objects"
    if any(n.startswith(CONSTANT_PREFIXES) for n in names):
        return "zig target-constant libraries"
    return "C startup and libc objects"


def main():
    root = sys.argv[1]
    counts = collections.Counter()
    sizes = collections.Counter()
    for entry in os.scandir(os.path.join(root, "o")):
        if not entry.is_dir():
            continue
        names, total = [], 0
        for item in os.scandir(entry.path):
            names.append(item.name)
            try:
                total += item.stat().st_size
            except OSError:
                pass
        key = classify(names)
        counts[key] += 1
        sizes[key] += total
    print(f"{'class':<30} {'entries':>8} {'bytes':>14} {'MiB':>9}")
    for key, count in counts.most_common():
        print(f"{key:<30} {count:>8} {sizes[key]:>14} "
              f"{sizes[key] / 2**20:>9.1f}")
    print(f"{'TOTAL o/':<30} {sum(counts.values()):>8} "
          f"{sum(sizes.values()):>14} {sum(sizes.values()) / 2**20:>9.1f}")


if __name__ == "__main__":
    main()
