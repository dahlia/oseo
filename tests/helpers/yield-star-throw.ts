/** Structured sync delegation cases; printing never changes their scope. */
export interface DelegatedThrowCase {
  readonly close: CloseKind;
  readonly method: ThrowKind;
  readonly value: number;
}

/** GetMethod and callable-result classes retained by shrinking. */
export const throwKinds = [
  "absent",
  "undefined",
  "null",
  "number",
  "object",
  "getter-throw",
  "call-throw",
  "primitive",
  "done-throw",
  "value-throw",
  "callable",
] as const;
/** One throw-method protocol class. */
export type ThrowKind = (typeof throwKinds)[number];

/** Return-method and IteratorClose result classes. */
export const closeKinds = [
  "absent",
  "undefined",
  "null",
  "number",
  "getter-throw",
  "call-throw",
  "primitive",
  "object",
] as const;
/** One observable close behavior, relevant only to a nullish throw. */
export type CloseKind = (typeof closeKinds)[number];

/** Every protocol boundary has a fixed witness, independent of random draws. */
export const delegatedThrowBoundaries: readonly DelegatedThrowCase[] =
  throwKinds.flatMap((method) =>
    closeKinds.map((close) => ({ close, method, value: 17 })),
  );

/**
 * GetMethod and YieldExpression oracle, independent of JavaScript execution.
 * A nullish method alone permits IteratorClose. A noncallable method and
 * abrupt getters/calls bypass it. IteratorClose never reads done or value.
 */
export function delegatedThrowExpected(
  cases: readonly DelegatedThrowCase[],
): string {
  const lines: string[] = [];
  for (const sample of cases) {
    const { close, method, value } = sample;
    let log = method === "absent" ? "" : "tg;";
    let error = "TypeError";
    let throwIdentity = false;
    let closeIdentity = false;
    if (["absent", "undefined", "null"].includes(method)) {
      if (close !== "absent") log += "rg;";
      if (close === "getter-throw") {
        error = "SyntaxError";
        closeIdentity = true;
      } else if (["call-throw", "primitive", "object"].includes(close)) {
        log += "rc;";
        if (close === "call-throw") {
          error = "SyntaxError";
          closeIdentity = true;
        }
      }
    } else if (method === "getter-throw") {
      error = "RangeError";
      throwIdentity = true;
    } else if (!["number", "object"].includes(method)) {
      log += "tc;";
      if (method !== "primitive") {
        if (method !== "call-throw") log += "d;";
        if (method === "value-throw" || method === "callable") log += "v;";
        error = "RangeError";
        throwIdentity = true;
      }
    }
    lines.push(`first ${value} false`);
    lines.push(
      method === "callable"
        ? "result true true"
        : `error ${error} ${throwIdentity} ${closeIdentity}`,
    );
    lines.push(`after true ${value} ${value + 1} ${log}f;`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Shared program shape for fixed and generated cases. The marker and sent
 * objects survive suspension and allocation pressure. Receiver, arity and
 * identity checks observe the real callable interface, not only its output.
 */
export function delegatedThrowSource(
  cases: readonly DelegatedThrowCase[],
): string {
  return `
function exercise(method, close, value) {
  let log = "";
  const marker = { value };
  const sent = { value: value + 1 };
  const thrown = new RangeError("throw");
  const closed = new SyntaxError("close");
  const inner = {
    [Symbol.iterator]() { return this; },
    next() { return { done: false, value: marker }; },
  };
  if (method !== "absent") {
    Object.defineProperty(inner, "throw", {
      get() {
        log += "tg;";
        if (method === "getter-throw") throw thrown;
        if (method === "undefined") return undefined;
        if (method === "null") return null;
        if (method === "number") return 1;
        if (method === "object") return {};
        return function (argument) {
          log += "tc;";
          if (this !== inner || arguments.length !== 1 || argument !== sent) {
            throw new Error("throw call interface");
          }
          if (method === "call-throw") throw thrown;
          if (method === "primitive") return 1;
          return {
            get done() {
              log += "d;";
              if (method === "done-throw") throw thrown;
              return true;
            },
            get value() {
              log += "v;";
              if (method === "value-throw") throw thrown;
              return marker;
            },
          };
        };
      },
    });
  }
  if (close !== "absent") {
    Object.defineProperty(inner, "return", {
      get() {
        log += "rg;";
        if (close === "getter-throw") throw closed;
        if (close === "undefined") return undefined;
        if (close === "null") return null;
        if (close === "number") return 1;
        return function () {
          log += "rc;";
          if (this !== inner || arguments.length !== 0) {
            throw new Error("return call interface");
          }
          if (close === "call-throw") throw closed;
          if (close === "primitive") return 1;
          return {
            get done() { throw new Error("close read done"); },
            get value() { throw new Error("close read value"); },
          };
        };
      },
    });
  }
  function* outer() {
    try { return yield* inner; } finally { log += "f;"; }
  }
  const generator = outer();
  const first = generator.next();
  console.log("first", first.value.value, first.done);
  let pressure = marker;
  for (let index = 0; index < 4; index++) {
    pressure = { previous: pressure, value: sent };
  }
  try {
    const result = generator.throw(sent);
    console.log("result", result.done, result.value === marker);
  } catch (error) {
    console.log("error", error.name, error === thrown, error === closed);
  }
  console.log("after", generator.next().done, marker.value, sent.value, log);
}
${cases
  .map(
    (sample) =>
      `exercise(${JSON.stringify(sample.method)}, ` +
      `${JSON.stringify(sample.close)}, ${sample.value});`,
  )
  .join("\n")}
`;
}
