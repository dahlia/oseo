import { readFileSync } from "node:fs";

/**
 * Ordered runner labels, two per Mac mini. The shell tools read this same
 * allow-list, so registration checks and readiness decisions cannot drift.
 * The final pair belongs to the rented fourth machine.
 */
export const selfHostedLaneLabels: readonly string[] = readFileSync(
  new URL("./selfhosted-mac/lane-labels.txt", import.meta.url),
  "utf8",
)
  .trimEnd()
  .split("\n");

/** Eight optional lanes; the repository variable keeps all of them off. */
export const configuredSelfHostedLanes: number = selfHostedLaneLabels.length;
