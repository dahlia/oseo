import { availableParallelism } from "node:os";

/** Leave half the available CPUs for another local lane. */
export function nativeTestWorkers(
  cpus: number,
  githubActions: boolean,
): number {
  return Math.max(1, githubActions ? cpus : Math.floor(cpus / 2));
}

if (import.meta.main) {
  console.log(
    nativeTestWorkers(
      availableParallelism(),
      process.env.GITHUB_ACTIONS === "true",
    ),
  );
}
