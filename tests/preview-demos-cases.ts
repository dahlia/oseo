import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Example programs under *examples/*, by file name. */
export type DemoSource =
  | "line-match.ts"
  | "numeric-hinted.ts"
  | "numeric-unhinted.ts"
  | "numeric-wrong-hints.ts"
  | "ray-tracer.ts";

/** Exact output, or a digest when the output is too large to inline. */
export type DemoOutput =
  | { readonly stdout: string }
  | { readonly stdoutBytes: number; readonly stdoutSha256: string };

/** One fixed invocation of an example and its only accepted result. */
export interface DemoCase {
  readonly source: DemoSource;
  readonly args: readonly string[];
  /** Standard input text; empty means immediate end of input. */
  readonly input: string;
  /** `DEMO_LABEL`, which is removed from the environment when omitted. */
  readonly label?: string;
  readonly expected: DemoOutput & {
    readonly stderr: string;
    readonly status: number;
  };
  /** The comparison workload from *examples/README.md*. */
  readonly workload?: true;
  /**
   * False for long loops, which a native run would otherwise slow with a
   * collection at every safepoint.
   */
  readonly forcedCollection?: false;
}

export const demoSources: readonly DemoSource[] = [
  "ray-tracer.ts",
  "line-match.ts",
  "numeric-hinted.ts",
  "numeric-unhinted.ts",
  "numeric-wrong-hints.ts",
];

/** The three source forms differ only in the add() parameter hints. */
export const numericForms = [
  "numeric-hinted.ts",
  "numeric-unhinted.ts",
  "numeric-wrong-hints.ts",
] as const;

const examples = new URL("../examples/", import.meta.url);

/** Read a fixed input as text, exactly as the examples decode stdin. */
export function exampleInput(name: string): string {
  return readFileSync(new URL(`inputs/${name}`, examples), "utf8");
}

function success(stdout: string) {
  return { stdout, stderr: "", status: 0 };
}

function failure(stderr: string) {
  return { stdout: "", stderr: stderr + "\n", status: 2 };
}

function call(
  source: DemoSource,
  args: readonly string[],
  expected: DemoCase["expected"],
  input = "",
  label?: string,
): DemoCase {
  return label === undefined
    ? { source, args, input, expected }
    : { source, args, input, label, expected };
}

function eachForm(
  build: (form: (typeof numericForms)[number]) => readonly DemoCase[],
): readonly DemoCase[] {
  return numericForms.flatMap(build);
}

const rayUsage = failure("usage: ray-tracer.ts [width height] (1..512)");
const lineUsage = failure("usage: line-match.ts [pattern [label]]");
const lineInvalid = failure("line-match: invalid pattern or unreadable input");
const numericUsage = failure("usage: numeric [iterations] (1..1000000)");
const numericInvalid = failure(
  "numeric: expected a JSON array of primitive pairs",
);
const unicodeInput = '눈 😀\nquote " and \\ slash\n--flag value\n';
const pairs = Array.from({ length: 1024 }, () => [1, 2]);

/** The numeric edge input and its fixed output with argument 2. */
export const numericEdgeInput: string = exampleInput("numeric-edges.json");
export const numericEdgeOutput: string =
  '{"iterations":2,"results":[3,140737488355328,' +
  '-140737488355329,0.75,"12","눈2",3,2,"-0",' +
  "140737488355328]}\n";

/**
 * Fixed cases grouped by the property each group pins. The reference test
 * runs every case under Node.js and Deno; the native scenario runs the same
 * cases against retained executables.
 */
export interface DemoCaseGroups {
  readonly rayPixels: readonly DemoCase[];
  readonly rayInvalid: readonly DemoCase[];
  readonly lineSelection: readonly DemoCase[];
  readonly lineUnicode: readonly DemoCase[];
  readonly lineInvalid: readonly DemoCase[];
  readonly lineComparison: readonly DemoCase[];
  readonly numericDefaults: readonly DemoCase[];
  readonly numericEdges: readonly DemoCase[];
  readonly numericInvalid: readonly DemoCase[];
  readonly numericBounds: readonly DemoCase[];
  readonly workloads: readonly DemoCase[];
}

export const demoCases: DemoCaseGroups = {
  rayPixels: [
    call("ray-tracer.ts", ["1", "1"], success("P3\n1 1\n255\n127 127 255\n")),
    call(
      "ray-tracer.ts",
      ["1", "2"],
      success("P3\n1 2\n255\n127 204 230\n127 51 230\n"),
    ),
    call(
      "ray-tracer.ts",
      ["2", "2"],
      success(
        [
          "P3",
          "2 2",
          "255",
          "165 201 255",
          "165 201 255",
          "218 233 255",
          "218 233 255",
          "",
        ].join("\n"),
      ),
    ),
  ],
  rayInvalid: [
    ["0"],
    ["-1"],
    ["513"],
    ["1.5"],
    ["NaN"],
    [""],
    ["1", "0"],
    ["1", "1", "extra"],
  ].map((args) => call("ray-tracer.ts", args, rayUsage)),
  lineSelection: [
    call(
      "line-match.ts",
      [],
      success(
        '{"label":"matches","lines":3,"matches":' +
          '[{"line":1,"text":"one"},{"line":3,"text":" two"}]}\n',
      ),
      "one\n\n two\r\n",
    ),
    call(
      "line-match.ts",
      ["^$"],
      success('{"label":"matches","lines":0,"matches":[]}\n'),
    ),
    call(
      "line-match.ts",
      ["^$"],
      success(
        JSON.stringify({
          label: "matches",
          lines: 1,
          matches: [{ line: 1, text: "" }],
        }) + "\n",
      ),
      "\n",
    ),
  ],
  lineUnicode: [
    call(
      "line-match.ts",
      ["^눈 .$"],
      success(
        JSON.stringify({
          label: 'env "눈"',
          lines: 3,
          matches: [{ line: 1, text: "눈 😀" }],
        }) + "\n",
      ),
      unicodeInput,
      'env "눈"',
    ),
    call(
      "line-match.ts",
      ["^--flag value$", ""],
      success(
        '{"label":"","lines":3,' +
          '"matches":[{"line":3,"text":"--flag value"}]}\n',
      ),
      unicodeInput,
    ),
    call(
      "line-match.ts",
      ["quote", "a b 😀"],
      success(
        JSON.stringify({
          label: "a b 😀",
          lines: 3,
          matches: [{ line: 2, text: 'quote " and \\ slash' }],
        }) + "\n",
      ),
      unicodeInput,
    ),
  ],
  lineInvalid: [
    call("line-match.ts", ["["], lineInvalid),
    call("line-match.ts", ["x", "label", "extra"], lineUsage),
  ],
  lineComparison: [
    call(
      "line-match.ts",
      ["^눈|error", "selected"],
      success(
        '{"label":"selected","lines":4,"matches":' +
          '[{"line":1,"text":"눈 😀"},' +
          '{"line":3,"text":"error: example"}]}\n',
      ),
      exampleInput("lines.txt"),
      "ignored",
    ),
  ],
  numericDefaults: eachForm((form) => [
    call(form, [], success('{"iterations":1000,"results":[3,7,11]}\n')),
    call(form, ["2"], success('{"iterations":2,"results":[]}\n'), "[]"),
    call(form, ["1"], success('{"iterations":1,"results":[3,7,11]}\n'), " \n"),
  ]),
  numericEdges: eachForm((form) => [
    call(form, ["2"], success(numericEdgeOutput), numericEdgeInput),
  ]),
  numericInvalid: eachForm((form) => [
    ...[
      "[",
      "null",
      "{}",
      "[1]",
      "[[1]]",
      "[[{},2]]",
      "[[[],2]]",
      "[[1,2,3]]",
    ].map((input) => call(form, ["1"], numericInvalid, input)),
    ...[["0"], ["1000001"], ["1.5"], ["oops"], [""], ["1", "extra"]].map(
      (args) => call(form, args, numericUsage),
    ),
  ]),
  numericBounds: eachForm((form) => [
    call(
      form,
      ["1"],
      success(
        JSON.stringify({ iterations: 1, results: Array(1024).fill(3) }) + "\n",
      ),
      JSON.stringify(pairs),
    ),
    call(form, ["1"], numericInvalid, JSON.stringify([...pairs, [1, 2]])),
    {
      ...call(
        form,
        ["1000000"],
        success('{"iterations":1000000,"results":[]}\n'),
        "[]",
      ),
      forcedCollection: false as const,
    },
    call(
      form,
      ["1"],
      success('{"iterations":1,"results":[null,null]}\n'),
      "[[1e400,-1e400],[1e400,1]]",
    ),
  ]),
  workloads: [
    {
      ...call("ray-tracer.ts", [], {
        stdoutBytes: 9149,
        stdoutSha256:
          "0419d3cdedcb79e81e13e122bd2df7adff9d73ae2f4f04c58f84769dbe0f645d",
        stderr: "",
        status: 0,
      }),
      workload: true,
      forcedCollection: false,
    },
    {
      ...call("ray-tracer.ts", ["160", "120"], {
        stdoutBytes: 228291,
        stdoutSha256:
          "09715eede8b2f212f1229cfbda04c71b609b8f8d867be52adbb8e0b740de92e9",
        stderr: "",
        status: 0,
      }),
      workload: true,
      forcedCollection: false,
    },
    ...eachForm((form) => [
      {
        ...call(
          form,
          ["100000"],
          success('{"iterations":100000,"results":[3,7,11]}\n'),
        ),
        workload: true as const,
        forcedCollection: false as const,
      },
    ]),
  ],
};

/** Every fixed case, in group order. */
export const allDemoCases: readonly DemoCase[] =
  Object.values(demoCases).flat();

/** Byte observation of one example process. */
export interface DemoObservation {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly status: number | null;
}

/** Compare bytes and status with a case's fixed result. */
export function assertDemoObservation(
  observed: DemoObservation,
  demo: DemoCase,
  context: string,
): void {
  const { expected } = demo;
  const where = `${context}: ${demo.source} ${JSON.stringify(demo.args)}`;
  if ("stdout" in expected) {
    assert.deepEqual(
      Buffer.from(observed.stdout),
      Buffer.from(expected.stdout),
      where,
    );
  } else {
    assert.equal(observed.stdout.length, expected.stdoutBytes, where);
    assert.equal(
      createHash("sha256").update(observed.stdout).digest("hex"),
      expected.stdoutSha256,
      where,
    );
  }
  assert.deepEqual(
    Buffer.from(observed.stderr),
    Buffer.from(expected.stderr),
    where,
  );
  assert.equal(observed.status, expected.status, where);
}
