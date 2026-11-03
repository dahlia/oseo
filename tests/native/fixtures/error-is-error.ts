import type { Es2026Fixture } from "../es2026-fixture.ts";

/*
 * Error.isError reports [[ErrorData]] and nothing else. The fixture
 * covers every object the runtime gives that slot (constructed native
 * errors, subclass instances, errors the runtime throws, and promise
 * rejection reasons) and the look-alikes that lack it: a proxy of an
 * error, an object inheriting from an error prototype, the prototypes
 * themselves, and an object whose Symbol.toStringTag says "Error".
 */
export const errorIsErrorFixtures: readonly Es2026Fixture[] = [
  {
    guardHits: true,
    name: "error-is-error",
    source: `
const descriptor = Object.getOwnPropertyDescriptor(Error, "isError");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  Error.isError.name,
  Error.isError.length,
  Object.getPrototypeOf(Error.isError) === Function.prototype,
);
console.log(
  "inherited",
  Object.hasOwn(TypeError, "isError"),
  TypeError.isError === Error.isError,
  Object.hasOwn(Error.prototype, "isError"),
);
const constructors = [
  Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError,
  URIError,
];
let native = "";
for (const constructor of constructors) {
  native = native + " " + constructor.name + "=" +
    Error.isError(new constructor("message")) + "/" +
    Error.isError(constructor("called"));
}
console.log("native", native.trim());
console.log(
  "aggregate",
  Error.isError(new AggregateError([new Error("inner")], "outer")),
  Error.isError(AggregateError([])),
);
class Derived extends RangeError {
  constructor(message) {
    super(message);
    this.extra = true;
  }
}
class FarDerived extends Derived {}
console.log(
  "subclass",
  Error.isError(new Derived("d")),
  Error.isError(new FarDerived("f")),
  Error.isError(Reflect.construct(Error, ["r"], Object)),
);
const lookalike = Object.create(Error.prototype);
lookalike.message = "not an error";
lookalike.name = "Error";
const tagged = { [Symbol.toStringTag]: "Error" };
const instance = new TypeError("proxied");
const proxy = new Proxy(instance, {});
const revocable = Proxy.revocable(new Error("revoked"), {});
revocable.revoke();
console.log(
  "lookalikes",
  Error.isError(lookalike),
  Error.isError(tagged),
  Object.prototype.toString.call(tagged),
  Error.isError(proxy),
  Error.isError(revocable.proxy),
  proxy instanceof TypeError,
);
let prototypes = "";
for (const constructor of [...constructors, AggregateError]) {
  prototypes = prototypes + (Error.isError(constructor.prototype) ? "1" : "0");
}
console.log(
  "prototypes",
  prototypes,
  Error.isError(Error),
  Error.isError(Error.isError),
);
const primitives = [
  undefined, null, true, false, 0, -0, 1.5, NaN, "", "Error", 10n,
  Symbol("error"), Symbol.for("error"),
];
let primitiveResults = "";
for (const value of primitives) {
  primitiveResults = primitiveResults + (Error.isError(value) ? "1" : "0");
}
console.log(
  "primitives",
  primitiveResults,
  Error.isError(),
  Error.isError(new Error("first"), 1),
);
const objects = [
  {}, [], function () {}, () => {}, new Map(), new Set(), new Date(0),
  /error/u, Object(1n), Object(Symbol("boxed")), Promise.resolve(),
  new ArrayBuffer(1), new Uint8Array(1), new WeakMap(), Object.create(null),
];
let objectResults = "";
for (const value of objects) {
  objectResults = objectResults + (Error.isError(value) ? "1" : "0");
}
console.log("objects", objectResults);
const mutated = new Error("mutated");
Object.setPrototypeOf(mutated, null);
const frozen = Object.freeze(new SyntaxError("frozen"));
const plain = {};
Object.setPrototypeOf(plain, TypeError.prototype);
console.log(
  "prototype changes",
  Error.isError(mutated),
  Error.isError(frozen),
  Error.isError(plain),
);
const thrown = [];
try { null.property; } catch (error) { thrown.push(Error.isError(error)); }
try { undefinedBinding; } catch (error) { thrown.push(Error.isError(error)); }
try { new Array(-1); } catch (error) { thrown.push(Error.isError(error)); }
try { decodeURIComponent("%"); } catch (error) {
  thrown.push(Error.isError(error));
}
try { JSON.parse("{"); } catch (error) { thrown.push(Error.isError(error)); }
try { throw { message: "object" }; } catch (error) {
  thrown.push(Error.isError(error));
}
console.log("thrown", thrown.join(","));
try { new Error.isError(new Error("construct")); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
const detached = Error.isError;
console.log(
  "receiver",
  detached(new Error("detached")),
  detached.call(undefined, new Error("call")),
  Error.isError.call({}, {}),
  Reflect.apply(Error.isError, null, [new URIError("apply")]),
);
let turn = 0;
while (turn < 2) {
  console.log("guard", Error.isError(new Error("turn")), Error.isError({}));
  if (turn === 0) Error.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
const replacement = Error.isError;
Error.isError = function isError() { return "replaced"; };
console.log("replaced", Error.isError(new Error("x")), replacement({}));
delete Error.isError;
console.log("deleted", typeof Error.isError, "isError" in Error);
Error.isError = replacement;
Promise.reject(new RangeError("rejected")).catch((reason) => {
  console.log("rejection", Error.isError(reason));
});
Promise.reject("text").catch((reason) => {
  console.log("primitive rejection", Error.isError(reason));
});
`,
  },
  {
    name: "error-is-error-cross-realm",
    source: `
const other = $262.createRealm().global;
const otherError = new other.Error("other");
const otherType = new other.TypeError("other type");
console.log(
  "cross realm",
  Error.isError(otherError),
  Error.isError(otherType),
  otherError instanceof Error,
  other.Error.isError(new Error("here")),
  other.Error.isError === Error.isError,
  Error.isError(new other.Proxy(otherError, {})),
  Error.isError(other.Object.create(other.Error.prototype)),
  Error.isError(new other.Object()),
);
console.log(
  "other prototypes",
  Error.isError(other.Error.prototype),
  Error.isError(other.AggregateError.prototype),
);
// The upstream other-realm non-error rows without new other.Function(""):
// other.Function.prototype and other.Object stand in as other-realm
// function objects.
console.log(
  "other non-errors",
  [
    new other.Object(), new other.Array(), new other.RegExp("a"),
    other.Function.prototype, other.Object,
    other.Error, other.EvalError, other.RangeError, other.ReferenceError,
    other.SyntaxError, other.TypeError, other.URIError,
    other.AggregateError,
  ].map((value) => Error.isError(value)).join(" "),
  // Like the upstream test, check SuppressedError only where it exists;
  // both branches print true when the row holds.
  typeof other.SuppressedError === "undefined" ||
    !Error.isError(other.SuppressedError),
);
`,
    test262Host: true,
  },
];
