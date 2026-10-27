import assert from "node:assert/strict";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { compileSource } from "../../packages/compiler/src/index.ts";
import type {
  MirProgram,
  SpecializationMode,
} from "../../packages/compiler/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import type { FrameContract } from "../proper-tail-call-resources.ts";
import { callableFrameCost } from "../proper-tail-call-resources.ts";

/** Fixed sources shared by pure preparation and separately run native tests. */
export interface InteropCase {
  readonly name: string;
  readonly source: string;
  readonly stdout: string;
  readonly guard: boolean;
}

const finishTrace = "clear:17:23|extra";
const semanticSource = `"use strict";
const events = [], checks = [];
const foreign = $262.createRealm().global;
const marker = new foreign.Object();
const key = Symbol("key");
marker.value = 17; marker[key] = 23;
function finish(value) {
  events.push("clear:" + value.value + ":" + value[key]);
  return clearTimeout(undefined, (events.push("extra"), value));
}
function tail(n, value, mode) {
  if (n === 0) return finish(value);
  if (mode === 0) return tail(n - 1, value, mode);
  if (mode === 1) return bound(n - 1, value, mode);
  if (mode === 2) return proxy(n - 1, value, mode);
  return tail.apply(null, [n - 1, value, mode]);
}
const bound = tail.bind(null), proxy = new Proxy(tail, {});
function control(value = marker) {
  events.push("control");
  checks.push(tail(3, value, 0) === undefined);
}
function* g(value = marker) {
  try {
    events.push("g:start"); yield value;
    checks.push(tail(3, value, 1) === undefined);
    events.push("g:after"); yield () => value;
  } finally { events.push("g:finally"); }
}
async function a(value = marker) {
  try {
    events.push("a:start"); await 0;
    checks.push(tail(3, value, 2) === undefined);
    events.push("a:after"); return () => value;
  } finally { events.push("a:finally"); }
}
async function* ag(value = marker) {
  try {
    events.push("ag:start"); yield value;
    checks.push(tail(3, value, 3) === undefined);
    events.push("ag:after"); return value;
  } finally { events.push("ag:finally"); }
}
async function main() {
  control();
  const it = g();
  checks.push(it.next().value === marker);
  checks.push(it.next().value() === marker);
  try { it.throw(marker); } catch (error) { checks.push(error === marker); }
  const closure = await a(); checks.push(closure() === marker);
  const ait = ag(); checks.push((await ait.next()).value === marker);
  const end = await ait.next(); checks.push(end.done && end.value === marker);
  checks.push(marker.value === 17, marker[key] === 23,
    Object.getPrototypeOf(marker) === foreign.Object.prototype);
  console.log(events.join("|")); console.log(checks.join(","));
}
main().catch(error => { throw error; });
`;

const denseApplySource = `"use strict";
const events = [], key = Symbol("payload");
const values = [2, { value: 17 }, { value: -1 }, { value: -2 }];
values[1][key] = 23;
function reenter(n, value) {
  if (n > 0) return reenter(n - 1, value);
  events.push("reenter:" + value.value + ":" + value[key]);
  return value;
}
function drain(n, value) {
  if (n > 0) return drain(n - 1, value);
  events.push("leaf:" + value.value + ":" + value[key]);
  return clearTimeout(undefined, events.push("host"));
}
function accept(n, value) {
  events.push("accept"); values.length = 0;
  return drain(n, value);
}
function invoke() { return accept.apply(null, values); }
function* resumed() {
  yield values[1];
  values.length = { valueOf() {
    events.push("coerce"); reenter(2, values[1]); return 2;
  } };
  events.push("trim:" + values.length + ":" + (2 in values));
  return invoke();
}
const it = resumed(); it.next();
const end = it.next();
console.log(events.join("|"));
console.log(end.done, end.value === undefined, values.length);
`;

const mutatingApplySource = `"use strict";
const events = [], values = [2, { value: 17 }, { value: -1 }, 0];
delete values[3];
const prototype = Object.create(Array.prototype);
function reenter(n, value) {
  if (n > 0) return reenter(n - 1, value);
  events.push("reenter:" + value.value); return value;
}
Object.defineProperty(values, "0", { configurable: true, get() {
  events.push("get0"); reenter(2, values[1]); values.length = 2;
  events.push("shrink:" + values.length); return 2;
} });
Object.defineProperty(prototype, "2", { get() {
  events.push("proto2:" + (this === values));
  reenter(1, values[1]); return { value: 29 };
} });
Object.defineProperty(prototype, "3", { get() {
  events.push("proto3:" + (this === values)); return { value: 31 };
} });
Object.setPrototypeOf(values, prototype);
function drain(n, a, b, c) {
  if (n > 0) return drain(n - 1, a, b, c);
  events.push("leaf:" + a.value + ":" + b.value + ":" + c.value);
  return clearTimeout(undefined, events.push("host"));
}
function accept(n, a, b, c) {
  events.push("argc:" + arguments.length); values.length = 0;
  return drain(n, a, b, c);
}
function invoke() { return Reflect.apply(accept, null, values); }
function* resumed() { yield 0; return invoke(); }
const it = resumed(); it.next(); it.next();
const failure = { value: 43 }, bad = [2, { value: 41 }, 0];
const badPrototype = Object.create(Array.prototype);
Object.defineProperty(bad, "0", { configurable: true, get() {
  events.push("bad0"); bad.length = 1; return 2;
} });
Object.defineProperty(badPrototype, "1", { get() {
  events.push("bad1"); reenter(1, failure); throw failure;
} });
Object.defineProperty(badPrototype, "2", { get() {
  events.push("unreachable"); return 0;
} });
Object.setPrototypeOf(bad, badPrototype);
function never() { events.push("unexpected"); }
function abrupt() { return never.apply(null, bad); }
try { abrupt(); } catch (error) {
  events.push("caught:" + (error === failure));
}
reenter(1, failure);
console.log(events.join("|"));
console.log(values.length, bad.length);
`;

/** Each resumed frame stays active while its ordinary helper tail-drains. */
function wideSource(depth: number): string {
  const bindings = Array.from(
    { length: 256 },
    (_, i) => `let a${i} = ${i};`,
  ).join("\n");
  return `"use strict";
function drain(n, value) {
  return n === 0 ? clearTimeout(undefined) : drain(n - 1, value);
}
function* wide(n = 0) {
${bindings}
  yield n;
  drain(4, a255);
  if (n > 0) {
    const it = wide(n - 1); it.next(); it.next();
  }
  return a255;
}
console.log("before");
const it = wide(${depth}); it.next();
console.log("after", it.next().value);
`;
}

/** Expectations follow source operations, never emitted or native output. */
export const interopCases: readonly InteropCase[] = [
  {
    name: "resumed-values-and-cleanup",
    source: semanticSource,
    stdout:
      `control|${finishTrace}|g:start|${finishTrace}|g:after|g:finally|` +
      `a:start|${finishTrace}|a:after|a:finally|` +
      `ag:start|${finishTrace}|ag:after|ag:finally\n` +
      `${Array.from({ length: 13 }, () => "true").join(",")}\n`,
    guard: false,
  },
  {
    name: "wide-continuation-control",
    source: wideSource(0),
    stdout: "before\nafter 255\n",
    guard: false,
  },
  {
    name: "dense-array-apply-and-truncation",
    source: denseApplySource,
    stdout:
      "coerce|reenter:17:23|coerce|reenter:17:23|trim:2:false|" +
      "accept|leaf:17:23|host\n" +
      "true true 0\n",
    guard: false,
  },
  {
    name: "mutating-array-apply-and-abrupt-getter",
    source: mutatingApplySource,
    stdout:
      "get0|reenter:17|shrink:2|proto2:true|reenter:17|proto3:true|" +
      "argc:4|leaf:17:29:31|host|bad0|bad1|reenter:43|caught:true|" +
      "reenter:43\n0 1\n",
    guard: false,
  },
];

/** Compile only; no host, process, or native toolchain is selected here. */
export function compileInterop(
  fixture: InteropCase,
  specialization: SpecializationMode,
): MirProgram {
  const result = compileSource(
    babelFrontend,
    { source: fixture.source, sourceId: `${fixture.name}.js` },
    {
      observeSpecialization: !fixture.guard,
      specialization,
      test262Host: true,
    },
  );
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  return result.mir;
}

export { balancedInteropBackend } from "./balanced-backend.ts";

/** Original logical continuation charges, distinct from compact heap roots. */
export interface ContinuationBudget {
  readonly cost: number;
  readonly depth: number;
  readonly heap: number;
  readonly logical: number;
  readonly mirRootSlots: number;
  readonly script: number;
}

/**
 * Read and bound the actual continuation charge without selecting a compiler.
 */
export function continuationBudget(
  mir: MirProgram,
  contract: FrameContract,
): ContinuationBudget {
  const fn = mir.functions.find((candidate) => candidate.name === "wide");
  assert.ok(fn?.generator === true);
  const source = cBackend.emit(mir).source;
  const charge = new RegExp(
    `case ${fn.id}u:\\s*result = oseo_frame_enter\\(context, ` +
      "OSEO_CALLABLE_FRAME_COST\\((\\d+)u\\)\\);\\s*" +
      "if \\(result.status == OSEO_STATUS_NORMAL\\) \\{\\s*" +
      `result = \\w*oseo_generator_body_${fn.id}\\(context, generator\\);` +
      "\\s*oseo_frame_leave\\(context, " +
      "OSEO_CALLABLE_FRAME_COST\\(\\1u\\)\\);",
    "u",
  ).exec(source);
  assert.ok(charge, "balanced continuation dispatcher charge");
  const heap = /oseo_generator_create\(context, callee, receiver, (\d+)u/u.exec(
    source,
  );
  const script = /oseo_frame_enter\(\s*&context, (\d+)u\)/u.exec(source);
  assert.ok(heap && script);
  const logical = Number(charge[1]);
  assert.ok(logical >= fn.rootSlotCount);
  assert.ok(logical > Number(heap[1]), "retain logical, not dense slots");
  const cost = callableFrameCost(contract, logical);
  const helper = mir.functions.find((candidate) => candidate.name === "drain");
  assert.ok(helper);
  const helperCharge = new RegExp(
    `case ${helper.id}u:\\s*result = oseo_frame_enter\\(context, ` +
      "OSEO_CALLABLE_FRAME_COST\\((\\d+)u\\)\\)",
    "u",
  ).exec(source);
  assert.ok(helperCharge);
  const helperCost = callableFrameCost(contract, Number(helperCharge[1]));
  const scriptCost = Number(script[1]);
  const depth = Math.floor((contract.maxActiveFrameSlots - scriptCost) / cost);
  assert.ok(scriptCost + cost + helperCost < contract.maxActiveFrameSlots);
  assert.ok(
    (depth + 1) * cost + scriptCost > contract.maxActiveFrameSlots,
    "active continuations alone require the frame guard",
  );
  const compactCost = callableFrameCost(contract, Number(heap[1]));
  assert.ok(
    (depth + 1) * compactCost + scriptCost + cost + helperCost <
      contract.maxActiveFrameSlots,
    "substituting compact continuation slots would wrongly admit this case",
  );
  // Two call levels per nested next (builtin and resume), plus a bounded
  // helper/creation margin. A frame guard must precede the call-depth guard.
  assert.ok(2 * (depth + 1) + 8 < contract.maxCallDepth);
  return {
    cost,
    depth,
    heap: Number(heap[1]),
    logical,
    mirRootSlots: fn.rootSlotCount,
    script: scriptCost,
  };
}

/**
 * Select a bounded guard from actual lane charges, not reference stack limits.
 */
export function interopGuard(
  contract: FrameContract,
  specialization: SpecializationMode,
): InteropCase {
  const probe: InteropCase = {
    name: "wide-continuation-guard",
    source: wideSource(0),
    stdout: "before\nafter 255\n",
    guard: true,
  };
  const { depth } = continuationBudget(
    compileInterop(probe, specialization),
    contract,
  );
  return {
    ...probe,
    name: `${probe.name}-m${contract.callableFrameMultiplier}`,
    source: wideSource(depth),
  };
}
