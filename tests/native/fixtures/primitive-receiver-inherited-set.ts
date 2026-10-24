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

/** Array ancestors retain their own guards and the primitive Set Receiver. */
export const primitiveSetArraySource = `
const primitives = [false, 7, "abc", Symbol("receiver"), 17n];
const intrinsics = [Boolean, Number, String, Symbol, BigInt];
const kinds = ["boolean", "number", "string", "symbol", "bigint"];
function strictStore(receiver, key, value) {
  "use strict"; receiver[key] = value;
}
function sloppyStore(receiver, key, value) { receiver[key] = value; }
for (let kind = 0; kind < primitives.length; kind++) {
  const primitive = primitives[kind];
  const intrinsic = intrinsics[kind];
  const prototype = intrinsic.prototype;
  const original = Object.getPrototypeOf(prototype);
  try {
    for (const callerStrict of [false, true]) {
      for (const setterStrict of [false, true]) {
        const trace = [];
        const payload = { marker: "rhs" };
        const reason = { marker: "throw" };
        const write = callerStrict ? strictStore : sloppyStore;
        const boxes = [];
        const truncated = [1, 2, 3, 4];
        let active = "";
        function capture(receiver, value) {
          trace.push(active + ":" + typeof receiver + ":" +
            Object.is(receiver, primitive) + ":" +
            Object.is(intrinsic.prototype.valueOf.call(receiver), primitive) +
            ":" + (value === payload));
          if (active === "dense") boxes.push(receiver);
          if (active === "truncate") truncated.length = 2;
          if (active === "throw" || active === "truncate") throw reason;
        }
        const strictSetter = function (value) {
          "use strict"; capture(this, value);
        };
        const sloppySetter = function (value) { capture(this, value); };
        const setter = setterStrict ? strictSetter : sloppySetter;
        function assign(label, owner, key) {
          active = label;
          Object.setPrototypeOf(prototype, owner);
          try {
            write(primitive, key, payload);
            trace.push(label + ":normal");
          } catch (error) {
            trace.push(label + ":" + (error === reason ? "reason" :
              error instanceof TypeError ? "TypeError" : "unexpected"));
          }
        }
        function accessor(owner, key) {
          Object.defineProperty(owner, key, {
            configurable: true, set: setter,
            get() { throw "getter must not run"; },
          });
          return owner;
        }
        const dense = accessor([0, 1, 2, 3], "3");
        assign("dense", dense, "3");
        assign("dense", dense, "3");
        trace.push("fresh:" + (boxes[0] !== boxes[1]));
        const named = [];
        named.note = payload;
        assign("named", accessor(named, "3"), "3");
        const symbol = [];
        symbol[Symbol("first")] = payload;
        assign("symbol", accessor(symbol, "3"), "3");
        const unordered = accessor([], "3");
        unordered[0] = payload;
        assign("unordered", unordered, "3");
        const deleted = [0, 1, 2, 3];
        delete deleted[0];
        delete deleted[3];
        assign("deleted", accessor(deleted, "3"), "3");
        const parent = accessor(Object.create(original), "3");
        const hole = [0, 1, 2, 3];
        delete hole[3];
        Object.setPrototypeOf(hole, parent);
        assign("hole", hole, "3");
        const later = accessor(Object.create(original), "6");
        const beyond = [0, 1];
        Object.setPrototypeOf(beyond, later);
        assign("beyond", beyond, "6");
        trace.push("beyond-length:" + beyond.length);
        assign("proxy", new Proxy(accessor([0, 1, 2, 3], "3"), {}), "3");
        assign("throw", new Proxy(accessor([0, 1, 2, 3], "3"), {}), "3");
        const descriptors = ["writable", "readonly", "getter", "missing"];
        for (const descriptor of descriptors) {
          const owner = [0, 1, 2, 3];
          if (descriptor === "missing") delete owner[3];
          else if (descriptor === "getter") {
            Object.defineProperty(owner, "3", {
              configurable: true, get() { throw "getter must not run"; },
            });
          } else {
            Object.defineProperty(owner, "3", {
              configurable: true, value: 11,
              writable: descriptor === "writable",
            });
          }
          assign(descriptor, owner, "3");
          trace.push(descriptor + "-length:" + owner.length);
          const own = Object.getOwnPropertyDescriptor(owner, "3");
          trace.push(descriptor + "-kept:" + (descriptor === "missing"
            ? own === undefined : descriptor === "getter"
              ? own.set === undefined : own.value === 11));
        }
        assign("own-zero", accessor([0], "0"), "0");
        const lengthOwner = [0, 1, 2, 3];
        const lengthValue = { valueOf() {
          trace.push("length-coercion"); return 1;
        } };
        active = "length";
        Object.setPrototypeOf(prototype, lengthOwner);
        try {
          write(primitive, "length", lengthValue);
          trace.push("length:normal");
        } catch (error) {
          trace.push("length:" + (error instanceof TypeError));
        }
        trace.push("ancestor-length:" + lengthOwner.length);
        const frozen = [0, 1, 2, 3];
        Object.defineProperty(frozen, "3", {
          value: 11, writable: false, configurable: false,
        });
        assign("invariant", new Proxy(frozen, {
          set() { return true; },
        }), "3");
        assign("truncate", accessor([0, 1, 2, 3], "3"), "3");
        trace.push("truncated:" + truncated.length + ":" + truncated[1] +
          ":" + (truncated[2] === undefined));
        truncated.push(payload);
        trace.push("continued:" + truncated.length + ":" +
          (truncated[2] === payload));
        console.log(kinds[kind], callerStrict, setterStrict, trace.join("|"));
      }
    }
  } finally {
    Object.setPrototypeOf(prototype, original);
  }
}
const ancestor = [0, 1, 2, 3];
const ordinary = { length: 4 };
const array = [0, 1, 2, 3];
console.log("controls", Reflect.set(ancestor, "length", 2, ordinary),
  ordinary.length, ancestor.length, Reflect.set(ancestor, "length", 2, array),
  array.length, array[1], array[2] === undefined, ancestor.length);
`;

/** Hand-specified traces follow Set precedence, never Oseo output. */
export const primitiveSetArrayExpected: string =
  ["boolean", "number", "string", "symbol", "bigint"]
    .flatMap((kind) =>
      [false, true].flatMap((callerStrict) =>
        [false, true].map((setterStrict) => {
          const binding = setterStrict
            ? `${kind}:true:true:true`
            : "object:false:true:true";
          const refused = callerStrict ? "TypeError" : "normal";
          const trace = [
            `dense:${binding}`,
            "dense:normal",
            `dense:${binding}`,
            "dense:normal",
            `fresh:${!setterStrict}`,
            `named:${binding}`,
            "named:normal",
            `symbol:${binding}`,
            "symbol:normal",
            `unordered:${binding}`,
            "unordered:normal",
            `deleted:${binding}`,
            "deleted:normal",
            `hole:${binding}`,
            "hole:normal",
            `beyond:${binding}`,
            "beyond:normal",
            "beyond-length:2",
            `proxy:${binding}`,
            "proxy:normal",
            `throw:${binding}`,
            "throw:reason",
            `writable:${refused}`,
            "writable-length:4",
            "writable-kept:true",
            `readonly:${refused}`,
            "readonly-length:4",
            "readonly-kept:true",
            `getter:${refused}`,
            "getter-length:4",
            "getter-kept:true",
            `missing:${refused}`,
            "missing-length:4",
            "missing-kept:true",
            ...(kind === "string"
              ? [`own-zero:${refused}`]
              : [`own-zero:${binding}`, "own-zero:normal"]),
            callerStrict ? "length:true" : "length:normal",
            "ancestor-length:4",
            "invariant:TypeError",
            `truncate:${binding}`,
            "truncate:reason",
            "truncated:2:2:true",
            "continued:3:true",
          ];
          return `${kind} ${callerStrict} ${setterStrict} ${trace.join("|")}`;
        }),
      ),
    )
    .join("\n") + "\ncontrols true 2 4 true 2 1 true 4\n";
