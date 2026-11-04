"""Extract the exhaustive RegExp literal properties' durations from CI logs.

Usage: python3 extract.py LOG_DIR > observations.tsv

LOG_DIR holds one `JOB.log` file per job, fetched with
`gh api --allow-escape-sequences repos/dahlia/oseo/actions/jobs/JOB/logs`
for every job ID that `jobs.tsv` lists. Each native property prints one
spec result line with its duration; a failed property prints its line
again in the failure summary, so only the first line per property counts.
An ordinary job runs one sweep per property. An extended case-shard job
runs two of its file's ten extended sweeps, so its seconds are halved to
give one sweep.
"""

import csv
import pathlib
import re
import sys

LINE = re.compile(
    r"([✔✖]) every accepted literal of "
    r"test/language/literals/regexp/S7\.8\.5_(A\d\.\d)_T2\.js "
    r"keeps its source natively \(([\d.]+)ms\)"
)
ESCAPE = re.compile(r"\x1b\[[0-9;]*m")


def main(log_dir: str) -> None:
    here = pathlib.Path(__file__).parent
    writer = csv.writer(sys.stdout, delimiter="\t", lineterminator="\n")
    writer.writerow(
        ["run", "attempt", "job", "placement", "domain", "result", "seconds"]
    )
    with open(here / "jobs.tsv", newline="") as jobs:
        for row in csv.DictReader(jobs, delimiter="\t"):
            text = ESCAPE.sub("", (pathlib.Path(log_dir) / (
                row["job"] + ".log")).read_text())
            sweeps = 2 if " case " in row["placement"] else 1
            seen = set()
            for mark, domain, millis in LINE.findall(text):
                if domain in seen:
                    continue
                seen.add(domain)
                writer.writerow([
                    row["run"], row["attempt"], row["job"],
                    row["placement"], domain,
                    "pass" if mark == "✔" else "fail",
                    f"{float(millis) / 1000 / sweeps:.1f}",
                ])


if __name__ == "__main__":
    main(sys.argv[1])
