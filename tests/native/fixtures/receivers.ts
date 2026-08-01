import type { Fixture } from "../fixture.ts";

/**
 * Script top-level `this` and the receiver substitution a non-strict
 * function shares with it. Every fixture runs its reference through
 * indirect `eval` so the host evaluates a global Script whose this
 * binding is the realm's global this value, which is the position these
 * fixtures compare against.
 *
 * An indirect `eval` creates its var-scoped global properties with
 * [[Configurable]] true, which a Script does not, and V8 creates global
 * declarations in source order rather than ECMA-262's functions-before-
 * vars order. These fixtures therefore observe only what the two
 * positions share: the property and the binding are one storage
 * location, and lexical names are absent from it. The Script-only
 * declaration order, descriptor, deletion, and [[Writable]] boundaries
 * are pinned by the global-declaration scenario in
 * tests/native/scenarios/shard-1.ts, which compares against fixed
 * ECMA-262 expectations instead of a host observation.
 */
export const receiverFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "script-this",
    nonStrictScript: true,
    source: `
const top = this;
console.log(typeof top, top === this, top === undefined);
this.receiverMarker = { tag: "kept" };
console.log(this.receiverMarker.tag, "receiverMarker" in this);
console.log(delete this.receiverMarker, "receiverMarker" in this);
function sloppy() { return this; }
console.log(sloppy() === top);
function strictly() { "use strict"; return this; }
console.log(strictly() === undefined);
const arrow = () => this;
console.log(arrow() === top);
function sloppyArrowOwner() { const inner = () => this; return inner(); }
console.log(sloppyArrowOwner() === top);
function strictArrowOwner() {
  "use strict";
  const inner = () => this;
  return inner();
}
console.log(strictArrowOwner() === undefined);
const holder = {
  arrowMember: () => this,
  method() { return this; },
};
console.log(holder.method() === holder, holder.arrowMember() === top);
const detachedMember = holder.method;
console.log(detachedMember() === top);
class Owner {
  read() { return this; }
  static readStatic() { return this; }
}
const owner = new Owner();
console.log(owner.read() === owner, Owner.readStatic() === Owner);
const detachedClassMethod = owner.read;
console.log(detachedClassMethod() === undefined);
function* stepped() { yield this; }
console.log(stepped().next().value === top);
function defaulted(value = this) { return value; }
console.log(defaulted() === top, defaulted(holder) === holder);
const arrowDefaulted = (value = this) => value;
console.log(arrowDefaulted() === top);
async function later() { return this; }
later().then((value) => console.log("async", value === top));
`,
  },
  {
    globalScriptReference: true,
    name: "script-global-bindings",
    nonStrictScript: true,
    source: `
console.log(typeof this.declared, this.counted, "counted" in this);
var counted = 1;
function declared() { return counted; }
let lexicalName = 2;
const constantName = 3;
class ClassName {}
console.log(counted, this.counted, this.declared());
this.counted = 4;
console.log(counted, this.declared());
counted = 5;
console.log(this.counted, this.declared());
counted += 1;
this.counted += 1;
console.log(counted, this.counted);
console.log(
  "lexicalName" in this,
  "constantName" in this,
  "ClassName" in this,
  "declared" in this,
);
const captured = () => this.counted;
function reader() { return counted; }
this.counted = 9;
console.log(captured(), reader());
counted = 10;
console.log(captured(), reader());
function nestedScope() { var hidden = 1; return hidden; }
console.log(nestedScope(), "hidden" in this);
if (counted) { var conditional = 11; }
console.log(this.conditional);
this.added = 12;
console.log(this.added, delete this.added, "added" in this);
`,
  },
  {
    globalScriptReference: true,
    name: "script-this-strict",
    source: `
"use strict";
const top = this;
console.log(typeof top, top === this, top === undefined);
this.strictMarker = 5;
console.log(this.strictMarker);
function strictFunction() { return this; }
console.log(strictFunction() === undefined);
const arrow = () => this;
console.log(arrow() === top);
const holder = { method() { return this; } };
console.log(holder.method() === holder);
function defaulted(value = this) { return value; }
console.log(defaulted() === undefined, defaulted(holder) === holder);
const arrowDefaulted = (value = this) => value;
console.log(arrowDefaulted() === top);
`,
  },
  {
    globalScriptReference: true,
    name: "script-this-hints",
    nonStrictScript: true,
    // The number return hint is false on the second read, so the guarded
    // addition misses and the compiled generic fallback runs instead.
    specialization: {
      genericCallsDisabled: 2,
      genericCallsEnabled: 1,
      hits: 3,
      misses: 2,
      overflowMisses: 0,
    },
    source: `
/** @param {number} left @param {number} right @returns {number} */
function add(left, right) { return left + right; }
/** @returns {number} */
function readCount() { return this.count; }
this.count = 1;
console.log(add(readCount(), 2));
this.count = "text";
console.log(add(readCount(), "!"));
console.log(typeof readCount());
`,
  },
];
