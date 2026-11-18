import assert from "node:assert/strict";
import type { RunRecord } from "../../perf-profile-process.ts";
import type { OwnershipRow } from "./ownership.ts";

/** Actual operation clock bounds, fixed when the operation occurred. */
export interface KernelMacEvent {
  readonly sequence: number;
  readonly commands?: readonly RunRecord[];
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly kind: "baseline" | "stop" | "restore";
  readonly listeners: readonly OwnershipRow[];
}

/** Judge pending samples using original event times. */
export class KernelMacTimeline {
  readonly #events: KernelMacEvent[] = [];
  readonly #windows: { readonly start: number; end: number | null }[] = [];

  record(event: KernelMacEvent): void {
    assert.equal(event.sequence, this.#events.length);
    assert.ok(Number.isFinite(event.startedMs));
    assert.ok(event.finishedMs >= event.startedMs);
    const previous = this.#events.at(-1);
    if (previous) assert.ok(event.startedMs >= previous.finishedMs);
    else assert.equal(event.kind, "baseline");
    assert.ok(event.listeners.length <= 2);
    assert.equal(
      new Set(event.listeners.map((row) => row.pid)).size,
      event.listeners.length,
    );
    for (const row of event.listeners) {
      assert.ok(row.uid === 502 || row.uid === 503);
      assert.ok(row.birth != null && row.birthPrecision === "one-second");
      assert.equal(row.ppid, 1);
      assert.equal(row.comm, "Runner.Listener");
    }
    this.#events.push(structuredClone(event));
  }

  open(start: number): void {
    assert.ok(Number.isFinite(start));
    assert.ok(this.#windows.every((window) => window.end != null));
    const latest = this.#events.at(-1);
    assert.ok(latest && latest.kind === "stop");
    assert.equal(latest.listeners.length, 0, "Partial bootout");
    assert.ok(start >= latest.finishedMs);
    this.#windows.push({ start, end: null });
  }

  close(end: number): void {
    const window = this.#windows.at(-1);
    assert.ok(window && window.end == null && end >= window.start);
    window.end = end;
  }

  require(row: OwnershipRow, start: number, end: number): boolean {
    if (row.uid !== 502 && row.uid !== 503) return false;
    assert.ok(Number.isFinite(start) && end >= start);
    assert.ok(
      !this.#windows.some(
        (window) =>
          end >= window.start && (window.end == null || start <= window.end),
      ),
      "Runner account active in original measurement window",
    );
    // A transition can straddle a sample. Its original known listener must
    // occur in one of the adjacent states, with unchanged birth and identity.
    const eligible = this.#events.filter(
      (event, index) =>
        event.startedMs <= end &&
        (this.#events[index + 1]?.finishedMs ?? Infinity) >= start,
    );
    assert.ok(
      eligible.some((event) =>
        event.listeners.some(
          (known) =>
            known.pid === row.pid &&
            known.uid === row.uid &&
            known.ppid === row.ppid &&
            known.comm === row.comm &&
            known.birth === row.birth &&
            known.birthPrecision === row.birthPrecision,
        ),
      ),
      "Listener lacks original transition identity",
    );
    return true;
  }
}
