/** Fresh subjects preserve every earlier Annex integrity program/oracle. */
export const annexbForInScenarios = [
  "ordering",
  "shadow",
  "deleted",
  "replacement",
  "during-delete",
  "seal",
  "freeze",
  "primitive",
  "untouched",
  "abrupt",
] as const;

/** A bounded metadata state; values never determine expected native output. */
export interface AnnexbForInCase {
  readonly scenario: (typeof annexbForInScenarios)[number];
  readonly value: number;
}

/** Render one isolated Script, including no read of the omitted accessor. */
export function annexbForInProgram(input: AnnexbForInCase): string {
  const prefix = `
const P = Object.prototype, K = "__proto__";
console.log("value", ${input.value});
function names(subject) {
  const keys = [];
  for (const key in subject) keys.push(key);
  return keys.join(",");
}
`;
  const enumerable = `Object.defineProperty(P, K, { enumerable: true });\n`;
  switch (input.scenario) {
    case "ordering":
      return (
        prefix +
        enumerable +
        `
P.after = 1; P[2] = 2; P[1] = 1; P[Symbol("hidden")] = 3;
P.tail = 4;
const child = Object.create(P); child[0] = 0; child.front = 5;
console.log("keys", Object.keys(P).join(","));
console.log("own", names(P));
console.log("child", names(child));
console.log("proxy", names(new Proxy(P, {})));
console.log("pie", P.propertyIsEnumerable(K));
`
      );
    case "shadow":
      return (
        prefix +
        enumerable +
        `
P.tail = 1;
const middle = Object.create(P);
Object.defineProperty(middle, K, {
  value: 2, configurable: true, enumerable: false,
});
const child = Object.create(middle); child.front = 3;
console.log("hidden", names(child));
Object.defineProperty(middle, K, { enumerable: true });
console.log("visible", names(child));
delete middle[K];
console.log("inherited", names(child));
Object.defineProperty(child, K, { value: 4, enumerable: false });
console.log("own hidden", names(child));
`
      );
    case "deleted":
      return (
        prefix +
        `
P.after = 1;
console.log("delete", delete P[K]);
P.tail = 2;
console.log("absent", names(P));
Object.defineProperty(P, K, {
  value: 3, enumerable: true, configurable: true,
});
console.log("recreated", names(P));
delete P[K]; P.last = 4;
Object.defineProperty(P, K, { value: 5, enumerable: true });
console.log("again", names(P));
`
      );
    case "replacement":
      return (
        prefix +
        `
P.after = 1;
let calls = 0;
Object.defineProperty(P, K, {
  get: undefined, set() { calls++; }, enumerable: true, configurable: true,
});
console.log("replaced", names(P), calls);
console.log("proxy", names(new Proxy(P, {})), calls);
delete P[K];
Object.defineProperty(P, K, { value: 2, enumerable: true });
console.log("recreated", names(P), calls);
`
      );
    case "during-delete":
      return (
        prefix +
        enumerable +
        `
P.tail = 1;
const child = Object.create(P); child.first = 2;
const visited = [];
for (const key in child) {
  visited.push(key);
  if (key === "first") delete P[K];
}
console.log("visited", visited.join(","));
console.log("after", names(P));
`
      );
    case "seal":
    case "freeze":
      return (
        prefix +
        enumerable +
        `
P.after = 1;
Object.${input.scenario}(P);
console.log("delete", Reflect.deleteProperty(P, K));
console.log("own", names(P));
console.log("child", names({}));
console.log("proxy", names(new Proxy(P, {})));
`
      );
    case "primitive":
    case "untouched":
      return (
        prefix +
        (input.scenario === "primitive" ? enumerable : "P.after = 1;\n") +
        `
for (const value of [false, 7, "ab", Symbol("s"), 1n]) {
  console.log(typeof value, names(value), names(Object(value)));
}
console.log("nullish", names(null) === "", names(undefined) === "");
`
      );
    case "abrupt":
      return (
        prefix +
        enumerable +
        `
const owned = { marker: ${input.value} };
const proxy = new Proxy({}, { ownKeys() { throw owned; } });
let same = false;
try { names(proxy); } catch (error) { same = error === owned; }
console.log("abrupt", same);
console.log("after", names({ first: 1 }));
`
      );
  }
}

/** Independent literal traces; never obtained from compiled observations. */
export function annexbForInExpected(input: AnnexbForInCase): string {
  const traces = {
    ordering:
      "keys 1,2,__proto__,after,tail\n" +
      "own 1,2,__proto__,after,tail\n" +
      "child 0,front,1,2,__proto__,after,tail\n" +
      "proxy 1,2,__proto__,after,tail\npie true\n",
    shadow:
      "hidden front,tail\nvisible front,__proto__,tail\n" +
      "inherited front,__proto__,tail\nown hidden front,tail\n",
    deleted:
      "delete true\nabsent after,tail\nrecreated after,tail,__proto__\n" +
      "again after,tail,last,__proto__\n",
    replacement:
      "replaced __proto__,after 0\nproxy __proto__,after 0\n" +
      "recreated after,__proto__ 0\n",
    "during-delete": "visited first,tail\nafter tail\n",
    seal:
      "delete false\nown __proto__,after\nchild __proto__,after\n" +
      "proxy __proto__,after\n",
    freeze:
      "delete false\nown __proto__,after\nchild __proto__,after\n" +
      "proxy __proto__,after\n",
    primitive:
      "boolean __proto__ __proto__\nnumber __proto__ __proto__\n" +
      "string 0,1,__proto__ 0,1,__proto__\nsymbol __proto__ __proto__\n" +
      "bigint __proto__ __proto__\nnullish true true\n",
    untouched:
      "boolean after after\nnumber after after\nstring 0,1,after 0,1,after\n" +
      "symbol after after\nbigint after after\nnullish true true\n",
    abrupt: "abrupt true\nafter first,__proto__\n",
  } satisfies Readonly<Record<AnnexbForInCase["scenario"], string>>;
  return `value ${input.value}\n${traces[input.scenario]}`;
}
