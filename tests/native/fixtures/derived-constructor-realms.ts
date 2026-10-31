import type { Fixture } from "../fixture.ts";

/** Generated domain for ordinary Construct result and body error realms. */
export interface DerivedRealmCase {
  readonly body: "primitive" | "empty" | "object" | "super" | "throw" | "this";
  readonly primitive: string;
  readonly strategy: "direct" | "tail" | "finally";
  readonly wrapper: "direct" | "bound" | "proxy";
  readonly foreignCaller: boolean;
}

/** Keep body errors in the callee and completion errors in the caller. */
export function derivedConstructorRealmSource(
  input: DerivedRealmCase,
  reference = false,
): string {
  const expression =
    input.body === "primitive"
      ? input.primitive
      : input.body === "object"
        ? "({answer: 42})"
        : "undefined";
  let body =
    input.body === "empty"
      ? ""
      : input.body === "super"
        ? "super();"
        : input.body === "throw"
          ? "throw new TypeError('body');"
          : input.body === "this"
            ? "void this;"
            : input.strategy === "tail"
              ? `function finish() { return ${expression}; } return finish();`
              : input.strategy === "finally"
                ? `try { return ${expression}; } finally { void 1; }`
                : `return ${expression};`;
  // A nested ordinary call must restore the constructor's caller record.
  body = "(function nested() { return 1; })();" + body;
  const script = `(class extends Object { constructor() { ${body} } })`;
  const constructor =
    input.wrapper === "bound"
      ? "C.bind(null)"
      : input.wrapper === "proxy"
        ? "new Proxy(C, {})"
        : "C";
  const success = input.body === "object" || input.body === "super";
  const error =
    input.body === "empty"
      ? reference
        ? "bodyReferenceError"
        : "ReferenceError"
      : input.body === "this"
        ? "bodyReferenceError"
        : input.body === "throw"
          ? "bodyTypeError"
          : "TypeError";
  const program = success
    ? `const result = new Subject();
       if (typeof result !== "object" || result === null)
         throw new Error("missing object");
       ${
         input.body === "object"
           ? 'if (typeof result.answer !== "number" || result.answer !== 42)' +
             ' throw new Error("wrong object result");'
           : ""
       }`
    : `let threw = false;
       try { new Subject(); }
       catch (error) {
         if (error.constructor !== ${error}) throw error;
         threw = true;
       }
       if (threw !== true) throw new Error("missing constructor error");`;
  return `
const calleeRealm = $262.createRealm();
const C = calleeRealm.evalScript(${JSON.stringify(script)});
const Subject = ${constructor};
const callerRealm = ${
    input.foreignCaller ? "$262.createRealm()" : "calleeRealm"
  };
callerRealm.global.Subject = Subject;
callerRealm.global.bodyTypeError = calleeRealm.global.TypeError;
callerRealm.global.bodyReferenceError = calleeRealm.global.ReferenceError;
callerRealm.evalScript(${JSON.stringify(program)});
${
  input.body === "primitive" && input.foreignCaller
    ? `
let rejected = false;
try {
  callerRealm.evalScript(${JSON.stringify(
    "{" + program.replace("!== TypeError", "!== bodyTypeError") + "}",
  )});
} catch (error) {
  if (!(error instanceof callerRealm.global.TypeError)) throw error;
  rejected = true;
}
if (!rejected) throw new Error("wrong error realm survived");
`
    : ""
}
console.log("derived-realm ok");
`;
}

function fixedRealmSource(
  strategy: DerivedRealmCase["strategy"],
  reference = false,
): string {
  return (["primitive", "empty", "object", "super", "throw", "this"] as const)
    .flatMap((body, index) =>
      [false, true].map((foreignCaller) => {
        const wrapper = (["direct", "bound", "proxy"] as const)[index % 3]!;
        return (
          "{\n" +
          derivedConstructorRealmSource(
            {
              body,
              primitive: "null",
              strategy,
              wrapper,
              foreignCaller,
            },
            reference,
          ) +
          "\n}"
        );
      }),
    )
    .join("\n");
}

/** A normative native program with a separately qualified reference. */
export interface DerivedRealmFixture extends Fixture {
  readonly referenceSource: string;
}

/** Fixed coverage spans every contract in each return strategy. */
export const derivedRealmFixtures: readonly DerivedRealmFixture[] = (
  ["direct", "tail", "finally"] as const
).map((strategy) => ({
  name: `derived-realm-${strategy}`,
  test262Host: true as const,
  source: fixedRealmSource(strategy),
  // Current Node/Deno differ on the pinned empty-body ReferenceError realm.
  // The reference qualifier never changes the normative native assertion.
  referenceSource: fixedRealmSource(strategy, true),
}));
