/** Structured integrity states; source and oracle stay separate below. */
export const annexbIntegrityScenarios = [
  "freeze",
  "seal",
  "prevent",
  "deleted-freeze",
  "deleted-seal",
  "proxy-freeze",
  "proxy-seal",
  "nested-freeze",
  "omit",
  "lie",
  "forward",
  "abrupt-own",
  "abrupt-define",
  "hybrid",
  "hybrid-seal",
  "hybrid-get",
  "opaque-traps",
  "both-undefined",
  "order",
  "nonconfig",
  "prevent-define",
  "abrupt-descriptor",
] as const;

/** One valid program; shrinking an integer keeps every state well scoped. */
export interface AnnexbIntegrityCase {
  readonly scenario: (typeof annexbIntegrityScenarios)[number];
  readonly value: number;
}

/** Render core metadata operations without invoking the omitted accessor. */
export function annexbIntegrityProgram(input: AnnexbIntegrityCase): string {
  const { scenario, value } = input;
  const prefix = `
const P = Object.prototype;
const K = "__proto__";
function strictDelete() {
  try { (function () { "use strict"; delete P.__proto__; })(); }
  catch (error) { return error.name; }
  return "normal";
}
`;
  if (
    scenario === "freeze" ||
    scenario === "seal" ||
    scenario === "prevent" ||
    scenario === "deleted-freeze" ||
    scenario === "deleted-seal" ||
    scenario === "proxy-freeze" ||
    scenario === "proxy-seal" ||
    scenario === "nested-freeze"
  ) {
    const deleted = scenario.startsWith("deleted-");
    const target =
      scenario === "nested-freeze"
        ? "new Proxy(new Proxy(P, {}), {})"
        : scenario.startsWith("proxy-")
          ? "new Proxy(P, {})"
          : "P";
    const operation =
      scenario === "prevent"
        ? "preventExtensions"
        : scenario.endsWith("seal")
          ? "seal"
          : "freeze";
    return (
      prefix +
      `
${deleted ? "delete P.__proto__;" : ""}
${
  scenario === "freeze"
    ? 'const copy = { ...P }; console.log("copy", Object.keys(copy).length);'
    : ""
}
Object.${operation}(${target});
console.log("state", Object.hasOwn(P, K), Object.isExtensible(P),
  Object.isSealed(P), Object.isFrozen(P));
console.log("delete", delete P.__proto__, Reflect.deleteProperty(P, K),
  strictDelete());
${
  deleted || scenario === "prevent"
    ? 'console.log("after", Object.hasOwn(P, K), typeof ({}).__proto__);'
    : ""
}
`
    );
  }
  if (
    scenario === "omit" ||
    scenario === "lie" ||
    scenario === "forward" ||
    scenario === "abrupt-own" ||
    scenario === "abrupt-define"
  ) {
    const owns =
      scenario === "omit"
        ? "return Reflect.ownKeys(target).filter(key => key !== K);"
        : scenario === "abrupt-own"
          ? "throw owned;"
          : "return [K, ...Reflect.ownKeys(target).filter(key => key !== K)];";
    const defines =
      scenario === "forward"
        ? "return Reflect.defineProperty(target, key, descriptor);"
        : scenario === "abrupt-define"
          ? "throw owned;"
          : "return true;";
    return (
      prefix +
      `
const trace = [];
const owned = new RangeError("owned");
const proxy = new Proxy(P, {
  ownKeys(target) { trace.push("own"); ${owns} },
  defineProperty(target, key, descriptor) {
    if (key === K) trace.push("define");
    ${defines}
  },
});
let error = "none";
let same = false;
try { Object.seal(proxy); }
catch (caught) { error = caught.name; same = caught === owned; }
console.log("trap", error, same, trace.join(","), Object.isExtensible(P));
console.log("after", delete P.__proto__, Object.hasOwn(P, K));
`
    );
  }
  if (scenario === "hybrid")
    return (
      prefix +
      `
let stored = 0;
function setter(value) {
  "use strict";
  stored = value + (typeof this === "number" ? 1 : 1000);
}
Object.defineProperty(P, K, { set: setter, configurable: true });
(1).__proto__ = ${value};
console.log("set", stored);
Object.defineProperty(P, K, { enumerable: true });
console.log("enum", Object.keys(P).includes(K), Object.hasOwn(P, K));
Object.defineProperty(P, K, { get: undefined });
const descriptor = Object.getOwnPropertyDescriptor(P, K);
console.log("descriptor", descriptor.get === undefined,
  descriptor.set === setter, descriptor.enumerable, descriptor.configurable);
Object.freeze(P);
(2).__proto__ = ${value + 1};
console.log("frozen", stored, delete P.__proto__, strictDelete());
console.log("same", Reflect.defineProperty(P, K, { set: setter }),
  Reflect.defineProperty(P, K, { set: function () {} }));
console.log("get", typeof ({}).__proto__);
`
    );
  if (scenario === "hybrid-seal")
    return (
      prefix +
      `
let stored = 0;
function setter(value) { "use strict"; stored = value; }
Object.defineProperty(P, K, { set: setter, configurable: true });
Object.seal(P);
(1).__proto__ = ${value};
console.log("sealed", stored, Object.isSealed(P), delete P.__proto__,
  strictDelete(), Reflect.defineProperty(P, K, { set: setter }),
  Reflect.defineProperty(P, K, { set: function () {} }));
`
    );
  if (scenario === "hybrid-get")
    return (
      prefix +
      `
function getter() {
  "use strict";
  return typeof this === "number" ? ${value} : ${value + 1};
}
Object.defineProperty(P, K, { get: getter, configurable: true });
Object.seal(P);
console.log("getter", (1).__proto__, ({}).__proto__,
  Reflect.defineProperty(P, K, { get: getter }));
const proxy = new Proxy(P, { set() { return true; } });
console.log("setter trap", Reflect.set(proxy, K, ${value}, 1));
`
    );
  if (scenario === "opaque-traps")
    return (
      prefix +
      `
Object.freeze(P);
const proxy = new Proxy(P, {
  get() { return ${value}; }, set() { return true; },
});
console.log("traps", proxy.__proto__, Reflect.set(proxy, K, ${value}, 1));
const refusal = new Proxy(P, {
  has() { return false; }, deleteProperty() { return true; },
});
let has = "none";
let removed = "none";
try { K in refusal; } catch (error) { has = error.name; }
try { Reflect.deleteProperty(refusal, K); }
catch (error) { removed = error.name; }
console.log("invariants", has, removed);
`
    );
  if (scenario === "both-undefined")
    return (
      prefix +
      `
Object.defineProperty(P, K, {
  get: undefined, set: undefined, configurable: true,
});
Object.freeze(P);
const descriptor = Object.getOwnPropertyDescriptor(P, K);
let get = "none";
let set = "none";
try { new Proxy(P, { get() { return 1; } }).__proto__; }
catch (error) { get = error.name; }
try { Reflect.set(new Proxy(P, { set() { return true; } }), K, 1); }
catch (error) { set = error.name; }
console.log("absent", descriptor.get === undefined,
  descriptor.set === undefined, typeof ({}).__proto__, get, set);
`
    );
  if (scenario === "order")
    return (
      prefix +
      `
P.userA = ${value};
delete P.toString;
Object.defineProperty(P, K, { enumerable: true });
console.log("virtual", Object.keys(P).join(","));
Object.defineProperty(P, K, {
  value: ${value}, writable: true, configurable: true,
});
console.log("stored", Object.keys(P).join(","), P.__proto__);
const { ...rest } = P;
console.log("rest", Object.keys(rest).join(","), rest.__proto__);
delete P.__proto__;
P.userB = ${value + 1};
P.__proto__ = ${value + 2};
console.log("recreated", Object.keys(P).join(","), P.__proto__);
`
    );
  if (scenario === "nonconfig")
    return (
      prefix +
      `
Object.defineProperty(P, K, { configurable: false });
console.log("known", Reflect.defineProperty(P, K, { enumerable: false }),
  Reflect.defineProperty(P, K, { value: ${value} }),
  Reflect.defineProperty(P, K, { get: undefined }),
  Reflect.defineProperty(P, K, { set: undefined }));
console.log("delete", delete P.__proto__, strictDelete());
`
    );
  if (scenario === "prevent-define")
    return (
      prefix +
      `
Object.preventExtensions(P);
Object.defineProperty(P, K, {
  value: ${value}, writable: true, configurable: true,
});
console.log("replace", P.__proto__, Object.hasOwn(P, K), delete P.__proto__);
console.log("absent", Reflect.defineProperty(P, K, { value: ${value + 1} }));
`
    );
  return (
    prefix +
    `
const owned = new RangeError("descriptor");
let same = false;
try {
  Object.defineProperty(P, K, {
    get configurable() { throw owned; },
  });
} catch (caught) { same = caught === owned; }
console.log("abrupt", same, delete P.__proto__);
`
  );
}

/** Independent abstract outcomes; never evaluates the rendered program. */
export function annexbIntegrityExpected(input: AnnexbIntegrityCase): string {
  const { scenario, value } = input;
  switch (scenario) {
    case "freeze":
      return (
        "copy 0\nstate true false true true\n" +
        "delete false false TypeError\n"
      );
    case "proxy-freeze":
    case "nested-freeze":
      return "state true false true true\ndelete false false TypeError\n";
    case "seal":
    case "proxy-seal":
      return "state true false true false\ndelete false false TypeError\n";
    case "prevent":
      return (
        "state true false false false\ndelete true true normal\n" +
        "after false undefined\n"
      );
    case "deleted-freeze":
      return (
        "state false false true true\ndelete true true normal\n" +
        "after false undefined\n"
      );
    case "deleted-seal":
      return (
        "state false false true false\ndelete true true normal\n" +
        "after false undefined\n"
      );
    case "omit":
      return "trap TypeError false own false\nafter true false\n";
    case "lie":
      return "trap TypeError false own,define false\nafter true false\n";
    case "forward":
      return "trap none false own,define false\nafter false true\n";
    case "abrupt-own":
      return "trap RangeError true own false\nafter true false\n";
    case "abrupt-define":
      return "trap RangeError true own,define false\nafter true false\n";
    case "hybrid":
      return (
        `set ${value + 1}\nenum true true\n` +
        "descriptor true true true true\n" +
        `frozen ${value + 2} false TypeError\nsame true false\nget undefined\n`
      );
    case "hybrid-seal":
      return `sealed ${value} true false TypeError true false\n`;
    case "hybrid-get":
      return `getter ${value} ${value + 1} true\nsetter trap true\n`;
    case "opaque-traps":
      return `traps ${value} true\ninvariants TypeError TypeError\n`;
    case "both-undefined":
      return "absent true true undefined TypeError TypeError\n";
    case "order":
      return (
        "virtual __proto__,userA\n" +
        `stored __proto__,userA ${value}\n` +
        `rest __proto__,userA ${value}\n` +
        `recreated userA,userB,__proto__ ${value + 2}\n`
      );
    case "nonconfig":
      return "known true false false false\ndelete false TypeError\n";
    case "prevent-define":
      return `replace ${value} true true\nabsent false\n`;
    case "abrupt-descriptor":
      return "abrupt true true\n";
  }
}
