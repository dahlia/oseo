import { readFileSync } from "node:fs";
import process from "node:process";

function add(a: string, b: string) {
  return a + b;
}

const args = process.argv.slice(2);
const iterations = args.length > 0 ? Number(args[0]) : 1000;
if (
  args.length > 1 ||
  !Number.isInteger(iterations) ||
  iterations < 1 ||
  iterations > 1000000
) {
  process.stderr.write("usage: numeric [iterations] (1..1000000)\n");
  process.exit(2);
}

try {
  const input = readFileSync(0, "utf8");
  const pairs =
    input.trim() === ""
      ? [
          [1, 2],
          [3, 4],
          [5, 6],
        ]
      : JSON.parse(input);
  if (!Array.isArray(pairs) || pairs.length > 1024) {
    throw new Error("expected at most 1024 pairs");
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error("expected pairs");
    }
    // JSON objects and arrays box to themselves; primitives do not.
    for (const value of pair) {
      if (Object(value) === value) {
        throw new Error("expected JSON primitives");
      }
    }
  }
  const results = [];
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < pairs.length; j++) {
      const result = add(pairs[j][0], pairs[j][1]);
      results[j] = Object.is(result, -0) ? "-0" : result;
    }
  }
  process.stdout.write(JSON.stringify({ iterations, results }) + "\n");
} catch {
  process.stderr.write("numeric: expected a JSON array of primitive pairs\n");
  process.exitCode = 2;
}
