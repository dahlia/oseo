"""Sum each Node test file's top-level test durations from CI job logs.

Usage: python3 extract.py LOG_DIR > node-file-costs.tsv

LOG_DIR holds `RUN-JOB.log` files fetched with
`gh api repos/dahlia/oseo/actions/jobs/JOB/logs`. The spec reporter prints
no file names, so each top-level result line is attributed among the files
that job executed, recomputed from the run's commit with Node's discovery
and the job's partition. A file's test names are the literal first
arguments of its `test`, `it`, `describe` and `suite` calls, with template
substitutions as wildcards. A result goes to the file with a name that
matches it completely, preferring the most literal characters. A result
that no literal name matches goes to a file that registers tests under a
computed name, by the longest string-literal fragment of six or more
characters found in the result. Node's spec reporter prints each file's
results as one block, in sorted path order. A result that two files name
equally well therefore goes to the one candidate that sorts between the
files of the nearest attributed results before and after it. The script
stops if that leaves a choice, if any result matches nothing, or if the
attributed files are not in sorted order, which also catches a result
credited to the wrong file. Sums are seconds of concurrent test time, not
file wall times.
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


CALL = re.compile(
    r"\b(?:test|it|describe|suite)\(\s*(?:"
    r'"((?:[^"\\\n]|\\.)*)"|\'((?:[^\'\\\n]|\\.)*)\'|`((?:[^`\\]|\\.)*)`'
    r")(\s*\+)?"
)
COMPUTED = re.compile(r"\b(?:test|it)\(\s*[A-Za-z_$]")


def unescape(text):
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m[1], m[1]), text)


def names(source):
    """Full-match patterns for literal test names, with literal lengths."""
    found = []
    for match in CALL.finditer(source):
        text = next(g for g in match.groups()[:3] if g is not None)
        pieces = [unescape(p) for p in re.split(r"\$\{[^}]*\}", text)]
        pattern = ".*".join(re.escape(p) for p in pieces)
        # A literal continued by `+` names only a prefix.
        if match.group(4) is not None:
            pattern += ".*"
        found.append((re.compile(pattern, re.S), sum(map(len, pieces))))
    return found


def fragments(source):
    found = set()
    for match in LITERAL.finditer(source):
        text = next(group for group in match.groups() if group is not None)
        for piece in re.split(r"\$\{[^}]*\}", text):
            if len(piece.strip()) >= 6:
                found.add(piece.strip())
    return found


def attribute(name, mine, cache):
    """The file that registered this result, or the tied candidates."""
    best, length, tied = None, -1, False
    for path in mine:
        for pattern, size in cache[path]["names"]:
            if size > length and pattern.fullmatch(name):
                best, length, tied = path, size, False
            elif size == length and best != path and pattern.fullmatch(name):
                tied = True
    if best is not None and length > 0:
        if tied:
            return sorted(
                path
                for path in mine
                for pattern, size in cache[path]["names"]
                if size == length and pattern.fullmatch(name)
            )
        return best
    computed = [path for path in mine if cache[path]["computed"]]
    best, length, tied = None, 0, False
    for path in computed:
        for piece in cache[path]["fragments"]:
            if piece in name and len(piece) > length:
                best, length, tied = path, len(piece), False
            elif piece in name and len(piece) == length and best != path:
                tied = True
    if best is None:
        raise SystemExit(f"unattributed result: {name}")
    if tied:
        raise SystemExit(f"ambiguous result: {name}")
    return best


def main(log_dir):
    sums = collections.defaultdict(dict)
    for run, (commit, jobs) in RUNS.items():
        files = discover(commit)
        cache = {}
        for job, host, index, total in jobs:
            pool = [path for path in files if host == "linux" or path != ARRAY]
            mine = [p for k, p in enumerate(pool) if k % total == index - 1]
            for path in mine:
                if path not in cache:
                    source = git("show", f"{commit}:{path}")
                    cache[path] = {
                        "names": names(source),
                        "computed": COMPUTED.search(source) is not None,
                        "fragments": fragments(source),
                    }
                sums[path].setdefault(f"{host}-{run}", 0.0)
            log = open(f"{log_dir}/{run}-{job}.log", errors="replace").read()
            results = []
            for line in re.sub(r"\x1b\[[0-9;]*m", "", log).splitlines():
                result = RESULT.match(line)
                # Prefixed mise task output from the build is not a test.
                if result is None or result.group(1).startswith("["):
                    continue
                owner = attribute(result.group(1), mine, cache)
                results.append([owner, float(result.group(2)) / 1000])
            rank = {path: k for k, path in enumerate(sorted(mine))}
            known = [k for k, entry in enumerate(results) if isinstance(entry[0], str)]
            for index, entry in enumerate(results):
                if isinstance(entry[0], str):
                    continue
                before = [k for k in known if k < index]
                after = [k for k in known if k > index]
                low = rank[results[before[-1]][0]] if before else -1
                high = rank[results[after[0]][0]] if after else len(mine)
                fits = [p for p in entry[0] if low <= rank[p] <= high]
                if len(fits) != 1:
                    raise SystemExit(f"ambiguous result in job {job}: {fits}")
                entry[0] = fits[0]
            order = [rank[owner] for owner, _ in results]
            if order != sorted(order):
                raise SystemExit(f"results out of file order in job {job}")
            for owner, seconds in results:
                sums[owner][f"{host}-{run}"] += seconds
    columns = [f"{h}-{r}" for h in ("linux", "macos") for r in RUNS]
    print("\t".join(["path", *columns]))
    for path in sorted(sums):
        values = [sums[path].get(c) for c in columns]
        print("\t".join([path, *("" if v is None else f"{v:.1f}" for v in values)]))


if __name__ == "__main__":
    main(sys.argv[1])
