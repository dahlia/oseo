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
`,
  },
];
