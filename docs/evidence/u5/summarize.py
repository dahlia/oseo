#!/usr/bin/env python3
"""Recompute the derived U5 values from the preserved measurements.

Run from the repository root:

    python3 docs/evidence/u5/summarize.py

Most inputs below are measured values quoted from a file in this directory.
Three are not, and are marked FROM BASELINE: the input-stability proportion
U4 measured and the two macOS family totals from the family tables. The
script performs only arithmetic that gate-cost-baseline.md labels derived,
for the reuse rates, the composition shares, the transfer rates, and the
three options' costs.
"""

# test262-shard-series.log
COLD = (628.91, 628.46)
WARM = (607.12, 618.08)
COLD_ENTRIES = 14637
WARM_NEW_ENTRIES = 14606
SHARD_CACHE_KIB = 2529612

# one-shard-composition.log, one shard
# Exact byte totals, so no row is a sum of rounded values.
COMPOSITION = {
    "per-case case.o": (7195, 1611645568),
    "per-case launcher.o": (7195, 347167712),
    "per-case harness.o": (96, 251047640),
    "per-case generated.o": (64, 150883120),
    "agent objects": (56, 22621936),
    "C startup and libc objects": (29, 1329435),
    "zig target-constant libraries": (2, 12751764),
}
STABLE_CLASSES = (
    "zig target-constant libraries",
    "C startup and libc objects",
)

# native-series.log, comparable pair and the support pair. The wall times and
# entry counts are measured; the reuse counts and cold-minus-warm differences
# this script prints from them are derived.
NATIVE_COLD_S = 430.11
NATIVE_WARM_S = 396.26
NATIVE_COLD_ENTRIES = 1500
NATIVE_WARM_NEW_ENTRIES = 345
NATIVE_CACHE_KIB = 902632
SUPPORT_COLD_S = 381.42
SUPPORT_WARM_S = 378.04
SUPPORT_COLD_ENTRIES = 3211
SUPPORT_WARM_NEW_ENTRIES = 3180
MACOS_NATIVE_JOBS = 3
INPUT_STABILITY = 0.646  # FROM BASELINE: U4's input-stability proportion

# target-constant.log
MACOS_CONST_S = (4.20, 4.66)
MACOS_CONST_BYTES = 19982810

# one-shard-payload.log
SHARD_COMPRESSED_BYTES = 292789226

# github-cache-throughput.log, run 36312192623. The macos15 and macos26
# runner images hold the mise cache at slightly different sizes; the save
# row's own log omits its size, which job 108600171522 supplies for the
# same macos26 key.
RESTORES = ((306078528, 9.885), (306078528, 11.085),
            (306078528, 11.983), (306192714, 6.211))
SAVE_BYTES = 306192714
SAVE_S = 22.763
ARCHIVE_HIT_S = (0.952, 1.584)

# Job inventory and repository cache state.
MACOS_ZIG_JOBS = 27
LINUX_ZIG_JOBS = 19
CACHE_LIMIT_BYTES = 10_000_000_000
CACHE_ACTIVE_BYTES = 4_058_176_690
MACOS_FAMILY_MIN = (764.12, 795.45)  # FROM BASELINE: derived family totals


def mean(values):
    return sum(values) / len(values)


def main():
    print("Shard series")
    cold, warm = mean(COLD), mean(WARM)
    print(f"  cold mean {cold:.2f} s, warm mean {warm:.2f} s, "
          f"difference {cold - warm:.2f} s ({(cold - warm) / cold * 100:.1f}%)")
    reused = COLD_ENTRIES - WARM_NEW_ENTRIES
    print(f"  reused on an identical repeat: {reused} of {COLD_ENTRIES} "
          f"({reused / COLD_ENTRIES * 100:.2f}%)")

    for name, cold, warm, n, new in (
        ("native 1/3", NATIVE_COLD_S, NATIVE_WARM_S,
         NATIVE_COLD_ENTRIES, NATIVE_WARM_NEW_ENTRIES),
        ("native support 1/12", SUPPORT_COLD_S, SUPPORT_WARM_S,
         SUPPORT_COLD_ENTRIES, SUPPORT_WARM_NEW_ENTRIES),
    ):
        print(f"  {name}: cold {cold:.2f} s, warm {warm:.2f} s, "
              f"difference {cold - warm:.2f} s; reused {n - new} of {n} "
              f"({(n - new) / n * 100:.2f}%)")

    print("Cache composition, one shard")
    total_n = sum(n for n, _ in COMPOSITION.values())
    total_b = sum(b for _, b in COMPOSITION.values())
    stable_n = sum(COMPOSITION[k][0] for k in STABLE_CLASSES)
    stable_b = sum(COMPOSITION[k][1] for k in STABLE_CLASSES)
    print(f"  {total_n} entries, {total_b} bytes "
          f"({total_b / 2**20:.1f} MiB)")
    print(f"  entries with no staging path in their inputs: {stable_n} "
          f"({stable_n / total_n * 100:.3f}% of entries, "
          f"{stable_b / total_b * 100:.2f}% of bytes)")
    print(f"  the warm test262 and native support arms each reused "
          f"{COLD_ENTRIES - WARM_NEW_ENTRIES}, which is that set")

    print("Observed runner transfer rates")
    rates = sorted(b / 1e6 / s for b, s in RESTORES)
    print(f"  restore {rates[0]:.2f} to {rates[-1]:.2f} MB/s end to end")
    save_rate = SAVE_BYTES / 1e6 / SAVE_S
    print(f"  save {save_rate:.2f} MB/s")
    print(f"  small-hit step overhead {min(ARCHIVE_HIT_S):.3f} to "
          f"{max(ARCHIVE_HIT_S):.3f} s")

    print("Option 1: share the whole cache")
    p = SHARD_COMPRESSED_BYTES / 1e6
    print(f"  one shard raw {SHARD_CACHE_KIB / 2**20:.2f} GiB, "
          f"compressed {p:.1f} MB")
    print(f"  restore {p / rates[-1]:.1f} to {p / rates[0]:.1f} s, "
          f"save {p / save_rate:.1f} s for each job")
    keys = MACOS_ZIG_JOBS + LINUX_ZIG_JOBS
    head = (CACHE_LIMIT_BYTES - CACHE_ACTIVE_BYTES) / 1e9
    print(f"  {MACOS_ZIG_JOBS} macOS shard keys hold "
          f"{MACOS_ZIG_JOBS * p / 1000:.2f} GB, all {keys} hold "
          f"{keys * p / 1000:.2f} GB, against {head:.2f} GB of headroom")

    print("Option 2: cache only the target-constant libraries")
    t = MACOS_CONST_BYTES / 1e6
    lo = MACOS_CONST_S[0] - (t / rates[0] + max(ARCHIVE_HIT_S))
    hi = MACOS_CONST_S[1] - (t / rates[-1] + min(ARCHIVE_HIT_S))
    print(f"  payload {t:.2f} MB, transfer {t / rates[-1]:.2f} to "
          f"{t / rates[0]:.2f} s, save {t / save_rate:.2f} s")
    print(f"  net {lo:.2f} to {hi:.2f} s for each job, "
          f"{MACOS_ZIG_JOBS * lo / 60:.2f} to {MACOS_ZIG_JOBS * hi / 60:.2f} "
          f"min for a run")
    for family in MACOS_FAMILY_MIN:
        print(f"    {MACOS_ZIG_JOBS * lo / 60 / family * 100:.3f}% to "
              f"{MACOS_ZIG_JOBS * hi / 60 / family * 100:.3f}% of {family} min")

    print("Option 3: cache only the native family, the one that reuses")
    ratio = SHARD_COMPRESSED_BYTES / (SHARD_CACHE_KIB * 1024)
    np = NATIVE_CACHE_KIB * 1024 * ratio / 1e6
    gain = NATIVE_COLD_S - NATIVE_WARM_S
    print(f"  payload a derived {np:.1f} MB, restore "
          f"{np / rates[-1]:.1f} to {np / rates[0]:.1f} s, "
          f"against a derived {gain:.2f} s")
    nlo = gain - (np / rates[0] + max(ARCHIVE_HIT_S))
    nhi = gain - (np / rates[-1] + min(ARCHIVE_HIT_S))
    print(f"  net {nlo:.2f} to {nhi:.2f} s for each job")
    print(f"  {MACOS_NATIVE_JOBS} macOS native jobs gain "
          f"{MACOS_NATIVE_JOBS * nlo / 60:.2f} to "
          f"{MACOS_NATIVE_JOBS * nhi / 60:.2f} min net, "
          f"{MACOS_NATIVE_JOBS * nlo * INPUT_STABILITY / 60:.2f} to "
          f"{MACOS_NATIVE_JOBS * nhi * INPUT_STABILITY / 60:.2f} min at the "
          f"{INPUT_STABILITY:.3f} input-stability proportion")
    for family in MACOS_FAMILY_MIN:
        print(f"    {MACOS_NATIVE_JOBS * nlo / 60 / family * 100:.3f}% to "
              f"{MACOS_NATIVE_JOBS * nhi / 60 / family * 100:.3f}% "
              f"of {family} min before the discount")


if __name__ == "__main__":
    main()
