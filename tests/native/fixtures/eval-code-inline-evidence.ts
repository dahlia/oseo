import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fixture } from "../fixture.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);

/**
 * One direct eval call in a pinned original. The call is replaced in place
 * by its evaluated source as a parenthesized expression, so the expression
 * resolves its names in the caller's own environment.
 */
export interface InlineCall {
  /** Exact original call expression, matched after the frontmatter. */
  readonly call: string;
  /** Cooked value of the call's single string literal argument. */
  readonly source: string;
  /** Parenthesized expression of `source` without directive or `;`. */
  readonly inline: string;
  /**
   * Expression that reads the wrong environment, such as the global
   * object an indirect eval would use; the original's own assertions
   * must reject it.
   */
  readonly mutation: string;
}

/** A pinned eval code original whose non-source subject inlining keeps. */
export interface InlineCase {
  readonly path: string;
  readonly sha256: string;
  /** Caller modes from the frontmatter flags. */
  readonly modes: readonly ("sloppy" | "strict")[];
  readonly calls: readonly InlineCall[];
}

const both = ["sloppy", "strict"] as const;
const sloppy = ["sloppy"] as const;
const strict = ["strict"] as const;
const direct = "test/language/eval-code/direct/";

/** Shadowed global `name` read through the caller's scope chain. */
function shadowedRead(value: string, name: string): InlineCall {
  return {
    call: `eval("\\'${value}\\' === ${name}")`,
    source: `'${value}' === ${name}`,
    inline: `('${value}' === ${name})`,
    mutation: `('${value}' === globalThis.${name})`,
  };
}

export const inlineCases: readonly InlineCase[] = [
  {
    path: `${direct}global-env-rec.js`,
    sha256: "9c3fa52d4b9d6ebf0e509eb4d5026e38d50303cc5041f19af7bd2f4f02f73bbe",
    modes: both,
    calls: [shadowedRead("str1", "__10_4_2_1_1_1")],
  },
  {
    path: `${direct}global-env-rec-catch.js`,
    sha256: "ae81311388b1f824f81a19e6501d70513a13516949f4314978003f659f1ae7ba",
    modes: both,
    calls: [shadowedRead("str2", "__10_4_2_1_3")],
  },
  {
    path: `${direct}global-env-rec-fun.js`,
    sha256: "627d9b0952d0503e0b2524167941faf63b4cc18a76c5f36eb0a8d61a34203895",
    modes: both,
    calls: [shadowedRead("str2", "__10_4_2_1_2")],
  },
  {
    path: `${direct}global-env-rec-with.js`,
    sha256: "4dd8f3e5db0a4b23abeff4f2695ca059cddd3d61a2a5b334ca8e389e6d55f91c",
    modes: sloppy,
    calls: [shadowedRead("str2", "__10_4_2_1_4")],
  },
  {
    path: `${direct}this-value-func-non-strict.js`,
    sha256: "855f8ca14f893ecc8f3e014b76ce8f23bc1602ecf945446d4ac213f0771ea340",
    modes: sloppy,
    calls: [
      {
        call: "eval('this;')",
        source: "this;",
        inline: "(this)",
        mutation: "(void 0)",
      },
    ],
  },
  {
    path: `${direct}this-value-func-strict-caller.js`,
    sha256: "838b126a6087648dafc87ac78e44d3546cc3658a90cd67632dfb583a64a4267a",
    modes: strict,
    calls: [
      {
        call: "eval('this;')",
        source: "this;",
        inline: "(this)",
        mutation: "(globalThis)",
      },
    ],
  },
  {
    path: `${direct}this-value-func-strict-source.js`,
    sha256: "7f05b94ebc81960a8bfc5f5da7b6fcee1896c44b85f736a6ebc19e014db64d0d",
    modes: sloppy,
    calls: [
      {
        call: `eval('"use strict"; this;')`,
        source: '"use strict"; this;',
        inline: "(this)",
        mutation: "(void 0)",
      },
    ],
  },
  {
    path: `${direct}lex-env-heritage.js`,
    sha256: "9a29cbfdc4aead7a86094c398bfd0c53805acd540c373942e4e0fa74d546709b",
    modes: both,
    calls: [
      {
        call: "eval('x;')",
        source: "x;",
        inline: "(x)",
        mutation: '("outside")',
      },
      {
        call: `eval('"use strict"; x;')`,
        source: '"use strict"; x;',
        inline: "(x)",
        mutation: '("outside")',
      },
    ],
  },
  {
    path: `${direct}new.target-fn.js`,
    sha256: "caf493999aba1d7f116bb61b6fa1c13ef1f494ec7e03f40a92c50fd323e6014f",
    modes: both,
    calls: [
      {
        call: "eval('new.target;')",
        source: "new.target;",
        inline: "(new.target)",
        mutation: "(void 0)",
      },
    ],
  },
];

/** Read the pinned original byte for byte. */
export function inlineOriginal(subject: InlineCase): string {
  return readFileSync(join(suite, subject.path), "utf8");
}

/**
 * Replace each eval call, in source order, after the frontmatter. Every
 * other byte of the original, including all assertions, is retained. A
 * mutation index replaces that call with its mutation instead.
 */
export function inlineProgram(subject: InlineCase, mutation = -1): string {
  const original = inlineOriginal(subject);
  const marker = "---*/";
  let cursor = original.indexOf(marker);
  if (cursor < 0) throw new Error(`${subject.path} has no frontmatter`);
  cursor += marker.length;
  let program = original;
  for (const [index, call] of subject.calls.entries()) {
    const at = program.indexOf(call.call, cursor);
    if (at < 0) throw new Error(`${subject.path} lacks ${call.call}`);
    const to = index === mutation ? call.mutation : call.inline;
    program = program.slice(0, at) + to + program.slice(at + call.call.length);
    cursor = at + to.length;
  }
  return program;
}

function realmVariant(id: string, program: string): readonly string[] {
  const realm = `r_${id}`;
  return [
    `const ${realm} = $262.createRealm();`,
    `${realm}.evalScript(${JSON.stringify(harness)});`,
    `${realm}.evalScript(${JSON.stringify(program)});`,
  ];
}

function fixtureName(subject: InlineCase): string {
  return "eval-code-inline-" + subject.path.slice(direct.length, -3);
}

/**
 * Each original and each mutation runs in a fresh realm after the harness.
 * A mutation must be rejected by that realm's Test262Error, a verdict that
 * does not depend on the comparator the original uses.
 */
export const inlineFixtures: readonly Fixture[] = inlineCases.map((subject) => {
  const lines: string[] = [];
  for (const mode of subject.modes) {
    const prefix = mode === "strict" ? '"use strict";\n' : "";
    lines.push(...realmVariant(`${mode}_0`, prefix + inlineProgram(subject)));
    for (const index of subject.calls.keys()) {
      const id = `${mode}_${index + 1}`;
      const [create, setup, invoke] = realmVariant(
        id,
        prefix + inlineProgram(subject, index),
      );
      lines.push(
        create!,
        setup!,
        `let rejected_${id} = false;`,
        "try {",
        invoke!,
        "} catch (error) {",
        `if (!(error instanceof r_${id}.global.Test262Error)) throw error;`,
        `rejected_${id} = true;`,
        "}",
        `if (!rejected_${id}) throw new Error("mutation survived");`,
      );
    }
  }
  const name = fixtureName(subject);
  lines.push(`console.log("${name} ok");`);
  return { name, source: lines.join("\n"), test262Host: true };
});
