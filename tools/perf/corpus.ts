import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** A fixed workload and its independently known checksum. */
export interface Kernel {
  readonly id: string;
  readonly expected: number;
  readonly license: "MIT" | "GPL-3.0-only";
  readonly origin: string;
}

const upstream =
  "https://github.com/smarr/are-we-fast-yet/blob/" +
  "74306fec151070fd07157cefeacf19e7e0bcdc89/benchmarks/JavaScript/";

/** Seeds and sizes stay fixed across engines, policies, and both hosts. */
export const kernels: readonly Kernel[] = [
  { id: "sieve", expected: 669, license: "MIT", origin: upstream + "sieve.js" },
  {
    id: "permute",
    expected: 8660,
    license: "MIT",
    origin: upstream + "permute.js",
  },
  {
    id: "json-roundtrip",
    expected: 2450,
    license: "GPL-3.0-only",
    origin: "Original Oseo JSON round-trip workload",
  },
  {
    id: "regexp",
    expected: 17400,
    license: "GPL-3.0-only",
    origin: "Original Oseo regular expression workload",
  },
];

/** Only this explicit user argument selects the diagnostic workload. */
export const kernelProfileFlag = "--oseo-kernel-profile";

/** Fixed diagnostic counts; timing, RSS and observe retain 100 calls. */
export function kernelProfileIterations(id: string): number {
  switch (id) {
    case "sieve":
      return 2000;
    case "permute":
      return 1000;
    case "json-roundtrip":
    case "regexp":
      return 10000;
    default:
      throw new Error(`Unknown profile kernel: ${id}`);
  }
}

/** Reject unreasonable or fractional loop counts before generating source. */
export function requireIterations(iterations: number): void {
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new Error("Iterations must be a positive safe integer.");
  }
}

/** Same plain Script source runs in all engines and single executables. */
export function renderKernel(
  kernel: Kernel,
  body: string,
  iterations: number,
): string {
  requireIterations(iterations);
  const startup = kernel.id === "startup";
  const selection = startup
    ? ""
    : `let perfIterations = ${iterations};
if (process.argv.length === 3 &&
    process.argv[2] === "${kernelProfileFlag}") {
  perfIterations = ${kernelProfileIterations(kernel.id)};
} else if (process.argv.length !== 2) {
  throw new Error("Invalid kernel arguments.");
}
`;
  const count = startup ? String(iterations) : "perfIterations";
  const marker = startup
    ? `"PERF_OK ${kernel.id} ${iterations}"`
    : `"PERF_OK ${kernel.id} " + perfIterations`;
  return `${body}
${selection}const perfStart = Date.now();
for (let repeat = 0; repeat < ${count}; repeat += 1) {
  const result = benchmark();
  if (result !== ${kernel.expected}) {
    throw new Error("Self-check failed: ${kernel.id}: " + result);
  }
}
const perfElapsed = Date.now() - perfStart;
console.log(${marker});
console.log("PERF_TIME " + perfElapsed);
`;
}

/** Read the reviewed source without an engine-specific wrapper. */
export function readKernel(kernel: Kernel): string {
  return readFileSync(
    new URL(`../../benchmarks/kernels/${kernel.id}.js`, import.meta.url),
    "utf8",
  );
}

/** Content digests identify inputs and artifacts independently of paths. */
export function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
