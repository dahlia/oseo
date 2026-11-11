import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertDemoObservation,
  demoCases,
  numericForms,
} from "./preview-demos-cases.ts";
import type { DemoCase, DemoObservation } from "./preview-demos-cases.ts";

const examples = new URL("../examples/", import.meta.url);

/** Run one case under Node.js and Deno and require identical bytes. */
function runBoth(demo: DemoCase): DemoObservation {
  const path = fileURLToPath(new URL(demo.source, examples));
  const env = { ...process.env };
  delete env.DEMO_LABEL;
  if (demo.label !== undefined) {
    env.DEMO_LABEL = demo.label;
  }
  const observations = ["node", "deno"].map((host) => {
    const prefix = host === "node" ? [] : ["run", "--quiet", "--allow-env"];
    const child = spawnSync(host, [...prefix, path, ...demo.args], {
      input: demo.input,
      env,
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(child.error, undefined, `${host}: ${child.error?.message}`);
    assert.equal(child.signal, null, `${host}: unexpected signal`);
    const observation = {
      stdout: child.stdout,
      stderr: child.stderr,
      status: child.status,
    };
    assertDemoObservation(observation, demo, host);
    return observation;
  });
  assert.deepEqual(observations[1], observations[0], demo.source);
  const first = observations[0];
  assert.ok(first);
  return first;
}

function runAll(cases: readonly DemoCase[]): void {
  for (const demo of cases) runBoth(demo);
}

test("ray tracer has fixed center, sky, and asymmetric sphere pixels", () => {
  runAll(demoCases.rayPixels);
});

test("ray tracer default output is a complete bounded PPM", () => {
  const [demo] = demoCases.workloads;
  assert.ok(demo !== undefined && demo.args.length === 0);
  const tokens = Buffer.from(runBoth(demo).stdout)
    .toString("utf8")
    .trim()
    .split(/\s+/);
  assert.deepEqual(tokens.slice(0, 4), ["P3", "32", "24", "255"]);
  assert.equal(tokens.length, 4 + 32 * 24 * 3);
  for (const token of tokens.slice(4)) {
    const channel = Number(token);
    assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255);
  }
});

test("ray tracer rejects invalid dimensions and extra arguments", () => {
  runAll(demoCases.rayInvalid);
});

test("line matcher selects numbered lines and emits escaped JSON", () => {
  runAll(demoCases.lineSelection);
});

test("line matcher preserves Unicode, arguments, and environment", () => {
  runAll(demoCases.lineUnicode);
});

test("line matcher rejects invalid patterns and extra arguments", () => {
  runAll(demoCases.lineInvalid);
});

test("numeric forms differ only in the add() parameter annotations", () => {
  const sources = numericForms.map((name) =>
    readFileSync(new URL(name, examples), "utf8").replace(
      /a: (number|string), b: (number|string)/,
      "a, b",
    ),
  );
  assert.equal(sources[0], sources[1]);
  assert.equal(sources[1], sources[2]);
});

test("numeric forms have identical default and empty-batch results", () => {
  runAll(demoCases.numericDefaults);
});

test("numeric forms preserve integer, overflow, and dynamic results", () => {
  runAll(demoCases.numericEdges);
});

test("numeric forms reject malformed input and invalid arguments", () => {
  runAll(demoCases.numericInvalid);
});

test("documented text comparison input has fixed selected lines", () => {
  runAll(demoCases.lineComparison);
});

test("numeric forms accept the pair bound and reject its successor", () => {
  runAll(demoCases.numericBounds);
});

test("comparison workloads have fixed outputs", () => {
  runAll(demoCases.workloads);
});
