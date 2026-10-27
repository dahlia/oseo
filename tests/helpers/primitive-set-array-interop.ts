import assert from "node:assert/strict";

import { compileSource } from "../../packages/compiler/src/index.ts";
import type {
  MirProgram,
  SpecializationMode,
} from "../../packages/compiler/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";

/** The original Set Script/oracle, shared with the TCO call protocol. */
export const primitiveSetDenseApplySource = `"use strict";
const events = [], key = Symbol("payload");
const values = [2, { value: 17 }, { value: -1 }, { value: -2 }];
values[1][key] = 23;
function reenter(n, value) {
  if (n > 0) {
    const held = [value, { value: n }, 0]; held.length = 1;
    return reenter(n - 1, held[0]);
  }
  values[1] = value;
  events.push("reenter:" + value.value + ":" + value[key]);
  return 91;
}
Object.defineProperty(Number.prototype, "tailPayload", {
  configurable: true, set: function primitiveTailSetter(value) {
    events.push("setter:" + (this === 7)); values[1] = undefined;
    return reenter(2, value);
  },
});
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
    events.push("coerce");
    const assigned = ((7).tailPayload = values[1]);
    events.push("rhs:" + (assigned === values[1])); return 2;
  } };
  events.push("trim:" + values.length + ":" + (2 in values));
  return invoke();
}
const it = resumed(); it.next();
const end = it.next();
console.log(events.join("|"));
console.log(end.done, end.value === undefined, values.length);
delete Number.prototype.tailPayload;
`;

/** Literal oracle retained from the original fifth interaction case. */
export interface PrimitiveSetArrayCase {
  readonly name: string;
  readonly source: string;
  readonly stdout: string;
  readonly guard: boolean;
}

/** The fixed case retains its original source identity and literal oracle. */
export const primitiveSetArrayCase: PrimitiveSetArrayCase = {
  name: "primitive-set-dense-apply",
  source: primitiveSetDenseApplySource,
  stdout:
    "coerce|setter:true|reenter:17:23|rhs:true|" +
    "coerce|setter:true|reenter:17:23|rhs:true|trim:2:false|" +
    "accept|leaf:17:23|host\n" +
    "true true 0\n",
  guard: false,
};

/** Compile the original Script without selecting a native toolchain. */
export function compilePrimitiveSetArray(
  specialization: SpecializationMode,
): MirProgram {
  const fixture = primitiveSetArrayCase;
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
