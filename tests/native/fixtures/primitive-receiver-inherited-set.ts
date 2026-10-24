import type { Fixture } from "../fixture.ts";

/** Minimized from the preserved strict Number setter counterexample. */
export const primitiveSetterSource = `
"use strict";
const seen = [];
Object.defineProperty(Number.prototype, "probe", {
  configurable: true,
  set(value) { seen.push("set " + typeof this + " " + value); },
});
try { (7).probe = 1; seen.push("done"); }
catch (error) { seen.push(error.constructor.name); }
console.log(seen.join(","));
`;

export const primitiveSetterExpected = "set number 1,done\n";

/** The computed Reference retains the original receiver and stored key. */
export const primitiveComputedSetterSource = `
"use strict";
const seen = [];
const key = {
  toString() { seen.push("conversion"); return "probe"; },
};
Object.defineProperty(Number.prototype, "probe", {
  configurable: true,
  get() { return typeof this; },
  set(value) { seen.push("set " + typeof this + " " + value); },
});
String.prototype.probe = function () { return typeof this; };
console.log("get", (7)[key]);
(7)[key] = 1;
(7)[key] ||= 2;
console.log("call", "s"[key]());
console.log("optional", (7)?.[key]);
console.log(seen.join(","));
delete Number.prototype.probe;
delete String.prototype.probe;
`;

export const primitiveComputedSetterExpected: string =
  "get number\ncall string\noptional number\n" +
  "conversion,conversion,set number 1,conversion,conversion,conversion\n";

export const primitiveReceiverSetFixtures: readonly Fixture[] = [
  {
    name: "primitive-receiver-inherited-set",
    source: primitiveSetterSource,
  },
  {
    name: "primitive-receiver-computed-set",
    source: primitiveComputedSetterSource,
  },
];

/** Fixed lookup precedence, mutation, abrupt completion, and Proxy controls. */
export const primitiveSetControlsSource = `
const trace = [];
let calls = 0;
const reason = { marker: "reason" };
const payload = { marker: "payload" };
const original = Object.getPrototypeOf(Number.prototype);
const first = Object.create(original);
const second = Object.create(original);
Object.defineProperty(first, "probe", {
  configurable: true,
  set(value) { "use strict"; trace.push("first"); },
});
Object.defineProperty(second, "probe", {
  configurable: true,
  get() { throw "getter"; },
  set(value) { "use strict";
    trace.push("second:" + typeof this + ":" + (value === payload));
    delete second.probe;
    const live = [{ value }, { receiver: this }];
    if (live[0].value !== payload) throw "lost payload";
    throw reason;
  },
});
Object.setPrototypeOf(Number.prototype, first);
const key = { [Symbol.toPrimitive]() {
  trace.push("key"); Object.setPrototypeOf(Number.prototype, second);
  return "probe";
} };
function rhs() { trace.push("rhs"); return payload; }
function write() { "use strict"; (7)[key] = rhs(); }
try { write(); } catch (error) { trace.push("throw:" + (error === reason)); }
console.log("mutation", trace.join(","));
const target = Object.create(original);
Object.defineProperty(target, "probe", {
  configurable: true,
  set: new Proxy(function (value) { "use strict";
    calls++; console.log("forward", typeof this, this === 7,
      value === payload);
  }, {}),
});
Object.setPrototypeOf(Number.prototype, new Proxy(target, {}));
(7).probe = payload;
console.log("calls", calls);
const revocable = Proxy.revocable(target, {});
Object.setPrototypeOf(Number.prototype, revocable.proxy);
revocable.revoke();
try { (7).probe = payload; } catch (error) {
  console.log("revoked", error instanceof TypeError);
}
const invariant = new Proxy(Object.defineProperty({}, "probe", {
  value: 1, writable: false, configurable: false,
}), { set() { return true; } });
Object.setPrototypeOf(Number.prototype, invariant);
try { (7).probe = payload; } catch (error) {
  console.log("invariant", error instanceof TypeError);
}
Object.setPrototypeOf(Number.prototype, original);
const own = Object.create(null);
Object.defineProperty(own, "probe", {
  set(value) { "use strict"; console.log("own", this === own,
    value === payload); },
});
own.probe = payload;
`;

export const primitiveSetControlsExpected: string =
  "mutation rhs,key,second:number:true,throw:true\n" +
  "forward number true true\ncalls 1\nrevoked true\ninvariant true\n" +
  "own true true\n";
