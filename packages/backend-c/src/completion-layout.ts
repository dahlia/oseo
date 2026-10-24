import type { MirBlock } from "@oseo/compiler";

/**
 * Physical storage owned by one emitted function, including its suspended
 * body and outlined chunks. Logical block IDs and frame charges never use
 * this map. Each completion keeps a distinct slot for its whole lifetime.
 */
export interface CompletionLayout {
  readonly count: number;
  readonly slot: (logicalId: number) => number;
}

/**
 * Collect every completion storage identity in the emitted block union.
 * Saved control destinations stay logical; outer handlers/finalizers also
 * own storage because resume copies both metadata and a rooted value there.
 */
export function createCompletionLayout(
  blocks: readonly MirBlock[],
): CompletionLayout {
  const identities = new Set<number>();
  const include = (identity: number): void => {
    if (!Number.isSafeInteger(identity) || identity < 0) {
      throw new Error(`Invalid completion storage identity ${identity}.`);
    }
    identities.add(identity);
  };
  for (const block of blocks) {
    for (const operation of block.operations) {
      if (operation.completionSlot != null) include(operation.completionSlot);
      if (operation.kind === "check-status" && operation.abruptTarget != null) {
        include(operation.abruptTarget.blockId);
      }
    }
    const terminator = block.terminator;
    if (terminator.kind === "resume-completion") {
      include(terminator.completionSlot);
      if (terminator.outerAbrupt != null) {
        include(terminator.outerAbrupt.blockId);
      }
      if (terminator.outerFinalizer != null) {
        include(terminator.outerFinalizer.blockId);
      }
    }
  }
  const slots = new Map(
    [...identities]
      .toSorted((left, right) => left - right)
      .map((identity, slot) => [identity, slot]),
  );
  return {
    count: slots.size,
    slot(logicalId) {
      const physical = slots.get(logicalId);
      if (physical == null) {
        throw new Error(`No physical slot for completion ${logicalId}.`);
      }
      return physical;
    },
  };
}
