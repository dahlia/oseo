import type { Fixture } from "../fixture.ts";

/** Type erasure preserves evaluation order, class fields and hint fallbacks. */
export const erasableTypeScriptFixtures: readonly Fixture[] = [
  {
    name: "erasable-typescript",
    source: `
interface Box<T> { value: T; }
type Choice<T> = T extends number ? number : string;
namespace Types { export type Value = number; }
declare const unavailable: never;
declare namespace Ambient { function unused(): void; }
let effects = 0;
function key(): string { effects = effects + 1; return "erased"; }
abstract class Base<T> { abstract read(): T; abstract [key()]: never; }
class Box<T extends { implements: unknown }>
  extends Base<T> implements Object {
  declare [key()]: never;
  public readonly value!: T;
  optional?: T;
  constructor(value: T) { super(); this.value = value; }
  read(): T { return this.value!; }
  method(x: T): T;
  method(x?: T): T | undefined { return x; }
  optionalMethod?(): number { return true ? 1 : 0; }
}
function identity<T>(this: unknown, value?: T): T | undefined {
  return value;
}
const id = identity<number>;
const values: Array<number | string> = [3, "four"];
const { value: extracted }: { value: number } = { value: 5 };
const [head, tail]: [number, string] = values as [number, string];
const box = new Box<number>(extracted);
console.log(effects, box.read(), box.method(), id(7), identity<string>("x"));
console.log(Object.hasOwn(box, "erased"), Object.hasOwn(box, "optional"));
console.log(
  identity.length, box.method.length, head, tail, box.optionalMethod(),
);
let count = 0;
const absent: Box<number> | null = null;
console.log(absent?.method!((count = count + 1)), count);
const getter = { get x(): number { count = count + 1; return count; } };
console.log((getter.x as unknown satisfies unknown)!, count);
function add(left: number, right: number): number { return left + right; }
console.log(add(2, 3), add("x" as any, 1));
let calls = 0;
function take(value: unknown) { calls = calls + 1; return value; }
const kept = take as any
(7)
const keptDeclaration = take
interface Between {}
(9)
const keptNumber = 1
type NumericBoundary = unknown
+2
const keptMinus = 1
interface MinusBoundary {}
-2
const keptRegex = 1
declare const MissingRegex: never;
/x/.test("x")
console.log(keptNumber, keptMinus, keptRegex);
const array = [[1]];
const keptArray = array satisfies any
[0]
const keptTag = take as any
\`tag\`
const method = "computed";
class AssertionField { value = 1 as any
  [method]() { return 9; }
}
class ReservedFields {
  static: number
  first() { return 1; }
  get?: number
  second() { return 2; }
  set!: number
  third(value: number) { return value; }
}
const fields = new ReservedFields();
console.log(
  typeof kept, typeof keptTag, typeof keptDeclaration,
  calls, Array.isArray(keptArray[0]),
);
console.log(new AssertionField().value, new AssertionField().computed());
console.log(
  Object.hasOwn(fields, "static"), Object.hasOwn(fields, "get"),
  Object.hasOwn(fields, "set"),
  fields.first(), fields.second(), fields.third(3),
);
const asyncIdentity = async <
  T
>(value: T): T => value;
const asyncPattern = async <T /*
  comment
*/> /*keep*/ ({ value }: { value: T }):
  T => value;
const asyncRest = async <
  T
>(...values: T[]): T[] => values;
asyncIdentity(7).then(value => console.log(value));
asyncIdentity("wrong" as any).then(value => console.log(value));
asyncPattern({ value: 8 }).then(value => console.log(value));
asyncRest(9, 10).then(values => console.log(values[0], values[1]));
let standalone = 0;
if (false) declare var ambientIf: number;
standalone++;
if (true) standalone++;
else declare var ambientElse: number;
standalone++;
while (false) declare function ambientWhile(): void;
standalone++;
do declare var ambientDo: number; while (false);
for (; false;) declare var ambientFor: number;
standalone++;
for (const key in {}) declare var ambientForIn: number;
standalone++;
for (const item of []) declare var ambientForOf: number;
standalone++;
console.log(standalone);
const chainObject = { value: 11 };
console.log((true ? chainObject : null)?.value);
console.log(identity?.(true ? 12 : 13), values?.[true ? 0 : 1]);
const genericCallable = value => value;
const genericArgument = 14;
const genericValue = 15;
console.log(genericCallable < genericArgument > (genericValue));
const genericIdentity = genericCallable < genericArgument >
genericValue;
console.log(genericIdentity === genericCallable);
function optionalObject(
  { value = true ? 16 : 17 }?: { value: number },
) { return value; }
const optionalArray = async <
  T
>([value = true ? 18 : 19]?: [number]): number => value;
console.log(
  optionalObject({}), optionalObject({ value: "wrong" } as any),
  optionalObject.length,
);
try { optionalObject(); } catch (error) {
  console.log(error instanceof TypeError);
}
optionalArray([]).then(value => console.log(value));
optionalArray(["false hint"] as any).then(value => console.log(value));
optionalArray().then(
  undefined, error => console.log(error instanceof TypeError),
);
`,
  },
];
