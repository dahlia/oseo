"""Sum each Node test file's top-level test durations from CI job logs.

Usage: python3 extract.py LOG_DIR > node-file-costs.tsv

LOG_DIR holds `RUN-JOB.log` files fetched with
`gh api repos/dahlia/oseo/actions/jobs/JOB/logs`. The spec reporter prints
no file names, so each top-level result line is attributed to the file in
the job's shard whose longest string-literal fragment (six characters or
more, split at template substitutions) occurs in the test name. The shard's
files are recomputed from the run's commit with Node's discovery and the
partition the job used, so a name is only matched against files that job
executed. Sums are seconds of concurrent test time, not file wall times.
"""

import collections
import re
import subprocess
import sys

# Run, commit, and (job, host, index, total) for every ordinary Node job.
RUNS = {
    "41228695658": ("9f21b607aef9399cc2a1f61d382f535af5161a2e", [
        ("124618237560", "linux", 1, 2), ("124618237592", "linux", 2, 2),
        ("124618238035", "macos", 1, 4), ("124618238086", "macos", 2, 4),
        ("124618238018", "macos", 3, 4), ("124622326197", "macos", 4, 4),
    ]),
    "41233967056": ("636157efd", [
        ("124633823177", "linux", 1, 2), ("124633823291", "linux", 2, 2),
        ("124633823856", "macos", 1, 4), ("124633823552", "macos", 2, 4),
        ("124633823633", "macos", 3, 4), ("124638762511", "macos", 4, 4),
    ]),
    "41238903460": ("8770b2e4ee0ffd1d4ebe97450da39689eb85238d", [
        ("124648530165", "linux", 1, 2), ("124648530170", "linux", 2, 2),
        ("124648530832", "macos", 1, 4), ("124648530605", "macos", 2, 4),
        ("124648530881", "macos", 3, 4), ("124652775918", "macos", 4, 4),
    ]),
}
ARRAY = "tests/property/m5-array-constructor.property.test.ts"
DISCOVERY = re.compile(
    r"(^|/)(test|test-[^/]*|[^/]*[._-]test)\.(js|mjs|cjs|ts|mts|cts)$"
    r"|(^|/)test/[^/]*\.(js|mjs|cjs|ts|mts|cts)$"
)
LITERAL = re.compile(
    r'"((?:[^"\\\n]|\\.)*)"|\'((?:[^\'\\\n]|\\.)*)\'|`((?:[^`\\]|\\.)*)`'
)
RESULT = re.compile(r"^\S+Z [✔✖﹣] (.*) \(([\d.]+)ms\)$")


def git(*args):
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def discover(commit):
    """Node 24's default discovery over the commit's tracked files."""
    return sorted(
        path
        for path in git("ls-tree", "-r", "--name-only", commit).split()
        if DISCOVERY.search(path) and "node_modules" not in path
    )


def fragments(commit, path):
    found = set()
    for match in LITERAL.finditer(git("show", f"{commit}:{path}")):
        text = next(group for group in match.groups() if group is not None)
        for piece in re.split(r"\$\{[^}]*\}", text):
            if len(piece.strip()) >= 6:
                found.add(piece.strip())
    return found


def main(log_dir):
    sums = collections.defaultdict(dict)
    for run, (commit, jobs) in RUNS.items():
        files = discover(commit)
        cache = {}
        for job, host, index, total in jobs:
            pool = [path for path in files if host == "linux" or path != ARRAY]
            mine = [p for k, p in enumerate(pool) if k % total == index - 1]
            for path in mine:
                cache.setdefault(path, fragments(commit, path))
                sums[path].setdefault(f"{host}-{run}", 0.0)
            log = open(f"{log_dir}/{run}-{job}.log", errors="replace").read()
            for line in re.sub(r"\x1b\[[0-9;]*m", "", log).splitlines():
                result = RESULT.match(line)
                # Prefixed mise task output from the build is not a test.
                if result is None or result.group(1).startswith("["):
                    continue
                name, best, length = result.group(1), None, 0
                for path in mine:
                    for piece in cache[path]:
                        if len(piece) > length and piece in name:
                            best, length = path, len(piece)
                if best is None:
                    raise SystemExit(f"unattributed result in {job}: {name}")
                sums[best][f"{host}-{run}"] += float(result.group(2)) / 1000
    columns = [f"{h}-{r}" for h in ("linux", "macos") for r in RUNS]
    print("\t".join(["path", *columns]))
    for path in sorted(sums):
        values = [sums[path].get(c) for c in columns]
        print("\t".join([path, *("" if v is None else f"{v:.1f}" for v in values)]))


if __name__ == "__main__":
    main(sys.argv[1])
