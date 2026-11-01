import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { isObject, isString } from "../tools/value-kinds.ts";
import {
  hostScriptTraincCases,
  type HostScriptTraincCase,
} from "./native/fixtures/host-script-trainc-cases.ts";
import {
  hostScriptTraincFixtures,
  hostScriptTraincGroupSize,
  hostScriptTraincOracleFixture,
  hostScriptTraincOriginal,
} from "./native/fixtures/host-script-trainc.ts";
import { traincEvidencePieces } from "./host-script-trainc-evidence.ts";

const strictPrefix = '"use strict"; void 0;\n';

interface FoundCall {
  readonly start: number;
  readonly call: string;
  readonly source: string;
  readonly indirect: boolean;
}

/** The Babel node fields this independent walk reads. */
interface SyntaxNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly name?: string;
  readonly value?: string;
  readonly init?: SyntaxNode | null;
  readonly id?: SyntaxNode;
  readonly callee?: SyntaxNode;
  readonly arguments?: readonly SyntaxNode[];
}

function syntaxNode<Candidate>(value: Candidate): SyntaxNode | undefined {
  if (!isObject(value) || Array.isArray(value)) return undefined;
  // SAFETY: Babel nodes are records with numeric offsets; only `type` is
  // read before the check below establishes that this record is a node.
  const node = value as Partial<SyntaxNode>;
  if (!isString(node.type)) return undefined;
  // SAFETY: a Babel record with a string type is a syntax node.
  return node as SyntaxNode;
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "extra") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      const parsed = syntaxNode(child);
      if (parsed != null) result.push(parsed);
    }
  }
  return result;
}

/** Re-derive every eval reference independently of the checked-in table. */
function evalCalls(text: string, original = true): FoundCall[] {
  // Recovery keeps early-error eval sources inspectable.
  const program = syntaxNode(
    parse(text, { errorRecovery: !original, sourceType: "script" }).program,
  )!;
  const aliases = new Set<string>();
  const references: SyntaxNode[] = [];
  const calls: FoundCall[] = [];
  const visit = (node: SyntaxNode, parent: SyntaxNode | null): void => {
    if (node.type === "Identifier" && node.name === "eval") {
      references.push(parent!);
    }
    if (
      node.type === "VariableDeclarator" &&
      node.init?.type === "Identifier" &&
      node.init.name === "eval"
    ) {
      aliases.add(node.id!.name!);
    }
    for (const child of children(node)) visit(child, node);
  };
  visit(program, null);
  const collect = (node: SyntaxNode): void => {
    if (node.type === "CallExpression") {
      const callee = node.callee!;
      const name = callee.type === "Identifier" ? callee.name! : "";
      if (name === "eval" || aliases.has(name)) {
        const args = node.arguments!;
        assert.equal(args.length, 1);
        assert.equal(args[0]!.type, "StringLiteral");
        calls.push({
          start: node.start,
          call: text.slice(node.start, node.end),
          source: args[0]!.value!,
          indirect: name !== "eval",
        });
      }
    }
    for (const child of children(node)) collect(child);
  };
  collect(program);
  // Every original eval reference is a call or an alias initializer.
  for (const parent of original ? references : []) {
    assert.ok(
      parent.type === "CallExpression" || parent.type === "VariableDeclarator",
      parent.type,
    );
  }
  return calls.toSorted((a, b) => a.start - b.start);
}

function parses(source: string): boolean {
  try {
    parse(source, { sourceType: "script" });
    return true;
  } catch {
    return false;
  }
}

test("train C selector retains the exact 98 bounded paths", () => {
  const selected = readFileSync(
    new URL(
      "../docs/m5c-graph/dynamic-source-host-script-trainc-evidence.paths.txt",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(selected).digest("hex"),
    "44886cc71f1d4a93786ae64b35842fad68ef24fb75dbfe7d0db21c466215a387",
  );
  const paths = hostScriptTraincCases.map((entry) => entry.path);
  assert.deepEqual(paths, selected.trim().split("\n"));
  assert.equal(new Set(paths).size, 98);
  const families = new Map<string, number>();
  for (const entry of hostScriptTraincCases) {
    families.set(entry.family, (families.get(entry.family) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(families), {
    "binding-introduction-and-references": 1,
    "eval-binding-instantiation": 1,
    "eval-syntax-errors": 34,
    "script-completion-values": 62,
  });
});

for (const subject of hostScriptTraincCases) {
  test(`train C site table matches the original: ${subject.path}`, () => {
    const original = hostScriptTraincOriginal(subject.path);
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      subject.sourceDigest,
    );
    const flags = /flags:\s*\[([^\]]*)\]/u.exec(original)?.[1]?.trim() ?? "";
    assert.deepEqual(
      subject.variants,
      flags === "noStrict"
        ? ["sloppy"]
        : flags === "onlyStrict"
          ? ["strict"]
          : ["sloppy", "strict"],
    );
    assert.deepEqual(
      evalCalls(original),
      subject.sites.map(({ start, call, source, indirect }) => ({
        start,
        call,
        source,
        indirect,
      })),
    );
    for (const site of subject.sites) {
      // Eval sources may name eval as a subject but call only nested.
      const nested = evalCalls(site.source, false);
      assert.deepEqual(
        nested.map(({ call, source }) => ({ call, source })),
        site.nested == null ? [] : [site.nested],
      );
      for (const variant of subject.variants) {
        const direct = variant === "strict" && !site.indirect;
        const host: string = (direct ? strictPrefix : "") + site.source;
        // An expected early error must be one before any evaluation.
        assert.equal(parses(host), site.expected != null, host);
        if (site.expected == null && direct && !/use strict/u.test(site.source))
          assert.ok(parses(site.source), "strictness must decide the error");
      }
    }
  });
}

function errorScripts(subjects: readonly HostScriptTraincCase[]): Set<string> {
  const sources = new Set<string>();
  for (const subject of subjects) {
    for (const site of subject.sites) {
      if (site.expected != null) continue;
      for (const variant of subject.variants) {
        const direct = variant === "strict" && !site.indirect;
        sources.add((direct ? strictPrefix : "") + site.source);
      }
    }
  }
  return sources;
}

test("train C evidence pieces run every fixture exactly once", () => {
  assert.deepEqual(traincEvidencePieces.flat(), [
    ...hostScriptTraincFixtures,
    hostScriptTraincOracleFixture,
  ]);
});

for (const [group, fixture] of [
  ...hostScriptTraincFixtures,
  hostScriptTraincOracleFixture,
].entries()) {
  test(`train C finite Script structure: ${fixture.name}`, () => {
    const subjects =
      fixture === hostScriptTraincOracleFixture
        ? []
        : hostScriptTraincCases.slice(
            group * hostScriptTraincGroupSize,
            (group + 1) * hostScriptTraincGroupSize,
          );
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: fixture.name + ".js" },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const scripts = compiled.mir!.test262Host!.scripts!;
      assert.ok(scripts.length > 0);
      // Exactly the expected early-error literals are matched malformed.
      assert.deepEqual(
        new Set(
          scripts
            .filter((script) => script.error != null)
            .map((script) => script.source),
        ),
        errorScripts(subjects),
      );
      const emitted = cBackend.emit(compiled.mir!);
      assert.match(emitted.source, /oseo_host_scripts/u);
    }
  });
}
