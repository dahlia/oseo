import type { NativeExecutionOptions } from "../../preview-process-support.ts";

interface ProcessCase {
  readonly name: string;
  readonly source: string;
  readonly execution?: NativeExecutionOptions;
  readonly module?: boolean;
  readonly test262Host?: boolean;
  readonly reference?: "none" | "node" | "status" | "specific";
  readonly expected?: string;
  readonly nodeExpected?: string;
  readonly denoExpected?: string;
  readonly denoStatus?: number;
  readonly status?: number;
  readonly diagnostic?: RegExp;
}

/** Fixed boundary classes from accepted ADR 0038. */
export const processCases: readonly ProcessCase[] = [
  {
    name: "arguments-and-environment",
    execution: {
      args: ["α", "--flag", "", "a b"],
      environment: { variables: { OSEO_PROCESS_TEST: "한글" } },
    },
    source: `console.log(JSON.stringify(process.argv.slice(2)));
console.log(process.env.OSEO_PROCESS_TEST);`,
    expected: '["α","--flag","","a b"]\n한글\n',
  },
  {
    name: "ordinary-objects-and-global-descriptor",
    reference: "none",
    expected:
      "true true false true\n" +
      "argv,env,exit,stdout,stderr,exitCode\nnumber 5 undefined undefined\n",
    source: `const d = Object.getOwnPropertyDescriptor(globalThis, "process");
console.log(d.value === process, d.writable, d.enumerable, d.configurable);
console.log(Reflect.ownKeys(process).join(","));
process.env.TEST = 5;
console.log(typeof process.env.TEST, process.env.TEST,
  process.stdin, process.versions);`,
  },
  {
    name: "builtin-singletons-and-export-cells",
    reference: "node",
    denoExpected:
      "true true true true true false false true\n" +
      "true false\ntrue\ntrue\nfalse true\n",
    module: true,
    source: `import p, {argv, env, stdout, stderr, exit} from "node:process";
import * as first from "node:process";
import * as second from "node:process";
import fs, {readFileSync} from "node:fs";
console.log(p === process, first === second,
  first.default === p, argv === p.argv, env === p.env,
  stdout === p.stdout, stderr === p.stderr, exit === p.exit);
const original = p.argv;
p.argv = [];
console.log(argv === original, argv === p.argv);
console.log(fs.readFileSync === readFileSync);
const lazy = await import("node:process");
console.log(lazy === first);
console.log(Object.isExtensible(first),
  Object.getPrototypeOf(first) === null);`,
  },
  {
    name: "input-text-and-eof",
    module: true,
    execution: {
      input: new Uint8Array([
        239, 187, 191, 0, 255, 226, 130, 65, 240, 159, 146, 169,
      ]),
    },
    source: `import {readFileSync} from "node:fs";
const input = readFileSync(0, {encoding: "utf-8"});
console.log(JSON.stringify(input));
console.log(readFileSync(0, "utf8").length);`,
  },
  {
    name: "input-and-output-bytes",
    module: true,
    execution: { input: new Uint8Array([0, 255, 128, 226, 130, 172]) },
    source: `import {readFileSync} from "node:fs";
const bytes = readFileSync(0);
console.log(bytes instanceof Uint8Array, bytes.length);
process.stdout.write(bytes);
process.stderr.write(new Uint8Array([0, 255]));
console.log(readFileSync(0).length);`,
  },
  {
    name: "ordered-output-and-view-offset",
    source: `console.log("before");
console.log(process.stdout.write("x\\ud800", "utf8"));
const bytes = new Uint8Array([0, 255, 65, 128]);
process.stdout.write(bytes.subarray(1, 3));
process.stderr.write("err");
console.log("after");
process.stdout.write(new Uint8Array(0));`,
  },
  {
    name: "write-type-errors",
    reference: "none",
    expected: "true\ntrue\ntrue\ntrue\ntrue\n",
    source: `for (const value of [1, {}, new Int8Array(1)]) {
  try { process.stdout.write(value); }
  catch (e) { console.log(e instanceof TypeError); }
}
try { process.stdout.write("x", () => {}); }
catch (e) { console.log(e instanceof TypeError); }
try { process.stdout.write("x", "utf8", () => {}); }
catch (e) { console.log(e instanceof TypeError); }`,
  },
  {
    name: "exit-code-validation",
    denoExpected:
      "ok undefined undefined\nok object null\n" +
      "ok string 7\nok number 4294967297\nok number 2147483648\n" +
      "ok number -1\nok number 300\nRangeError ERR_OUT_OF_RANGE\n" +
      "TypeError ERR_INVALID_ARG_TYPE\nRangeError ERR_OUT_OF_RANGE\n" +
      "ok number 9007199254740992\nTypeError ERR_INVALID_ARG_TYPE\n" +
      "TypeError ERR_INVALID_ARG_TYPE\nTypeError ERR_INVALID_ARG_TYPE\n",
    reference: "node",
    source: `for (const value of [undefined, null, "7", 4294967297,
  2147483648, -1, 300, 1.5, "5.5", NaN, 9007199254740992,
  "", "abc", true]) {
  try {
    process.exitCode = value;
    console.log("ok", typeof process.exitCode, process.exitCode);
  } catch (e) { console.log(e.name, e.code); }
}
process.exitCode = undefined;`,
  },
  {
    name: "normal-completion-waits-for-work",
    source: `process.exitCode = 300;
Promise.resolve().then(() => console.log("job"));
setTimeout(() => { console.log("timer"); }, 1);`,
    status: 44,
  },
  {
    name: "exit-skips-finally-and-work",
    source: `process.exitCode = 5;
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("job"));
try { process.stdout.write("before"); process.exit(); }
finally { console.log("finally"); }`,
    expected: "before",
    status: 5,
  },
  {
    name: "explicit-undefined-clears-exit-code",
    denoStatus: 5,
    denoExpected: "",
    reference: "node",
    source: `process.exitCode = 5; process.exit(undefined);`,
    status: 0,
  },
  {
    name: "uncaught-error-overrides-exit-code",
    reference: "status",
    source: `process.exitCode = 5; throw new Error("failure");`,
    status: 1,
  },
  {
    name: "unhandled-rejection-overrides-exit-code",
    reference: "status",
    source: `process.exitCode = 5; Promise.reject("failure");`,
    status: 1,
  },
  {
    name: "unsupported-path",
    module: true,
    reference: "none",
    source: `import {readFileSync} from "node:fs";
process.exitCode = 5;
readFileSync("file");`,
    status: 1,
    diagnostic: /OSEO3001.*readFileSync/u,
  },
  {
    name: "unsupported-encoding",
    module: true,
    reference: "none",
    source: `import {readFileSync} from "node:fs";
readFileSync(0, "latin1");`,
    status: 1,
    diagnostic: /OSEO3001.*encoding/u,
  },
  {
    name: "initial-realm-only",
    test262Host: true,
    reference: "none",
    source: `const other = $262.createRealm();
console.log(typeof process, typeof other.global.process);`,
    expected: "object undefined\n",
  },
  {
    name: "unsupported-input-options",
    module: true,
    reference: "none",
    source: `import {readFileSync} from "node:fs";
readFileSync(0, {encoding: "utf8", flag: "r"});`,
    status: 1,
    diagnostic: /OSEO3001.*options/u,
  },
  {
    name: "buffer-and-environment-deviations",
    module: true,
    reference: "specific",
    execution: { input: new Uint8Array([65, 66]) },
    expected: "true number\n65,66\n",
    nodeExpected: "false string\nAB\n",
    denoExpected: "false string\nAB\n",
    source: `import {readFileSync} from "node:fs";
const bytes = readFileSync(0);
process.env.OSEO_VALUE_KIND = 5;
console.log(bytes.constructor === Uint8Array,
  typeof process.env.OSEO_VALUE_KIND);
console.log(bytes.toString());`,
  },
  {
    name: "invalid-utf8-boundaries",
    module: true,
    execution: {
      input: new Uint8Array([
        239, 187, 191, 192, 175, 237, 160, 128, 244, 144, 128, 128, 224, 160,
        65, 226, 130,
      ]),
    },
    source: `import {readFileSync} from "node:fs";
console.log(JSON.stringify(readFileSync(0, "utf8")));`,
  },
  {
    name: "invalid-exit-argument-is-catchable",
    reference: "node",
    denoExpected: "TypeError ERR_INVALID_ARG_TYPE\nalive\n",
    source: `try { process.exit("5.5"); }
catch (error) { console.log(error.name, error.code); }
console.log("alive");`,
  },
];
