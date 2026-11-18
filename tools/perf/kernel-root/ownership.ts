import assert from "node:assert/strict";

/** Original stat and sampled row; a null birth never becomes a known one. */
export interface OwnershipRow {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly uid: number;
  readonly comm: string;
  readonly birth: string | null;
  readonly birthPrecision: string;
}

/** Kernel stat identity with an explicit session and original start ticks. */
export interface KernelSessionStat {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly sid: number;
  readonly ticks: string;
}

/** Parse the session field which S's public stat parser intentionally omits. */
export function kernelSessionStat(raw: string): KernelSessionStat {
  const match = /^(\d+) \((.*)\) ([RSDZTWtXxKWPIN]) (.*)\n?$/su.exec(raw);
  assert.ok(match, "Malformed proc stat");
  assert.ok(!["Z", "X", "x"].includes(match[3]!));
  const tail = match[4]!.trim().split(/\s+/u);
  assert.ok(tail.length >= 19);
  for (const field of [match[1], ...tail.slice(0, 3), tail[18]])
    assert.match(field!, /^\d+$/u);
  const result = {
    pid: Number(match[1]),
    ppid: Number(tail[0]),
    group: Number(tail[1]),
    sid: Number(tail[2]),
    ticks: tail[18]!,
  };
  for (const value of [result.pid, result.ppid, result.group, result.sid])
    assert.ok(Number.isSafeInteger(value) && value > 0);
  return result;
}

/** A missing leaf needs the same known anchored chain on both sides of ps. */
export function requireStableKernelChain(
  row: OwnershipRow,
  current: readonly OwnershipRow[],
  previous: readonly OwnershipRow[],
  rootPid: number,
  uid: number,
  seen: ReadonlySet<number>,
  brackets: (pid: number) => void,
): void {
  assert.equal(row.uid, uid);
  assert.equal(row.birth, null);
  assert.equal(row.birthPrecision, "unknown");
  assert.equal(seen.has(row.pid), false, "Reused unknown leaf PID");
  const visited = new Set([row.pid]);
  const groups = new Set([row.pid]);
  let pid = row.ppid;
  let childBirth: string | null = null;
  while (true) {
    assert.equal(visited.has(pid), false, "Cyclic ancestry");
    visited.add(pid);
    const now = current.find((item) => item.pid === pid);
    const before = previous.find((item) => item.pid === pid);
    assert.ok(now && before, "Missing stable known ancestor");
    for (const key of [
      "pid",
      "ppid",
      "group",
      "uid",
      "comm",
      "birth",
      "birthPrecision",
    ] as const)
      assert.equal(now[key], before[key], "Ancestor identity changed");
    assert.equal(now.uid, uid);
    assert.equal(now.birthPrecision, "kernel-ticks");
    assert.ok(now.birth != null, "Unknown intermediate birth");
    if (childBirth != null) assert.ok(BigInt(childBirth) >= BigInt(now.birth));
    childBirth = now.birth;
    groups.add(now.group);
    brackets(pid);
    if (pid === rootPid) break;
    pid = now.ppid;
  }
  assert.ok(groups.has(row.group), "Unowned detached leaf group");
}
