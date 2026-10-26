import assert from "node:assert/strict";
import test from "node:test";
import type { MirOperation, MirProgram } from "@oseo/compiler";

import {
  boundBody,
  BodyUnits,
  bodyUnit,
  replaceSyntax,
  selectBodyUnit,
} from "../src/bounded-body.ts";
import { cBackend } from "../src/index.ts";

const repeated = Array.from(
  { length: 1200 },
  (_, index) => `    roots[${index}] = result.value;`,
);

/** Model the old selector's branches recursively, independently of emission. */
function legacyUnitView(source: string, unit: number): string {
  const start = source.match(
    /^#if !defined\(OSEO_C_BODY_UNIT\) \|\| OSEO_C_BODY_UNIT == (\d+)\n/mu,
  );
  if (start == null) return source;
  const contentStart = start.index! + start[0].length;
  let depth = 1;
  let alternate: number | undefined;
  for (const directive of source
    .slice(contentStart)
    .matchAll(/^#(if|ifdef|ifndef|else|endif)\b[^\n]*(?:\n|$)/gmu)) {
    const position = contentStart + directive.index;
    if (["if", "ifdef", "ifndef"].includes(directive[1]!)) depth++;
    else if (directive[1] === "else" && depth === 1) alternate = position;
    else if (directive[1] === "endif") depth--;
    if (depth !== 0) continue;
    const selected = Number(start[1]) === unit;
    const branch = selected
      ? source.slice(contentStart, alternate ?? position)
      : alternate == null
        ? ""
        : source.slice(source.indexOf("\n", alternate) + 1, position);
    return legacyUnitView(
      source.slice(0, start.index) +
        branch +
        source.slice(position + directive[0].length),
      unit,
    );
  }
  assert.fail("The legacy aggregate has an unclosed selector.");
}

/** Compare generated C tokens, including literal bytes and directive order. */
function cTokens(source: string): readonly string[] {
  const token = new RegExp(
    [
      String.raw`/\*[\s\S]*?\*/|//[^\n]*`,
      String.raw`"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'`,
      String.raw`[A-Za-z_][A-Za-z_0-9]*|[0-9][A-Za-z_0-9.]*`,
      String.raw`>>=|<<=|\.\.\.|->|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\|`,
      String.raw`[+*/%&|^=-]=|##|[^\s]`,
    ].join("|"),
    "gu",
  );
  return [...source.matchAll(token)]
    .map((match) => match[0])
    .filter((text) => !text.startsWith("/*") && !text.startsWith("//"));
}

test("unit materialization preserves common text and resource branches", () => {
  const source = [
    '#include "oseo_runtime.h"',
    "#if 64u <= OSEO_MAX_ACTIVE_FRAME_SLOTS",
    "typedef struct { OseoValue *roots; } State;",
    "#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == 1",
    "const uint16_t text[] = {123, 125};",
    "#else",
    "extern const uint16_t text[];",
    "#endif",
    bodyUnit("size_t helper(State *s) { return s->roots[0]; }", 2),
    "#else",
    "#define rejected 1",
    "#endif",
    "",
  ].join("\n");
  for (const unit of [0, 1, 2]) {
    const selected = selectBodyUnit(source, unit);
    assert.deepEqual(cTokens(selected), cTokens(legacyUnitView(source, unit)));
    assert.equal(selected.split("\n").length, source.split("\n").length);
    assert.equal(
      selected.split("\n")[1],
      "#if 64u <= OSEO_MAX_ACTIVE_FRAME_SLOTS",
    );
    assert.equal(selected.includes("const uint16_t text[] ="), unit === 1);
    assert.equal(
      selected.includes("extern const uint16_t text[];"),
      unit !== 1,
    );
    assert.equal(selected.includes("size_t helper(State *s)"), unit === 2);
    assert.match(selected, /#else\n#define rejected 1\n#endif/u);
  }
});

test("unit literals and comments retain their bytes", () => {
  const common = [
    "/*",
    "#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == 9",
    "#endif",
    "*/",
    'const char *text = "continued\\',
    "#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == 9\\",
    '#endif";',
    "// continued comment \\",
    "#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == 9",
    "",
  ].join("\n");
  const source = common + bodyUnit("int selected;", 1);
  assert.ok(selectBodyUnit(source, 0).startsWith(common));
  assert.ok(selectBodyUnit(source, 1).startsWith(common));
  assert.doesNotMatch(selectBodyUnit(source, 0), /int selected;/u);
  assert.match(selectBodyUnit(source, 1), /int selected;/u);
});

test("nested selectors cannot reactivate an excluded outer unit", () => {
  const source =
    bodyUnit(bodyUnit("int unreachable;", 2), 1) +
    bodyUnit("int launcher = __LINE__;", 0);
  for (const unit of [0, 1, 2]) {
    const selected = selectBodyUnit(source, unit);
    assert.doesNotMatch(selected, /int unreachable;/u);
    assert.equal(selected.includes("int launcher"), unit === 0);
    assert.deepEqual(cTokens(selected), cTokens(legacyUnitView(source, unit)));
    const line = source.split("\n").indexOf("int launcher = __LINE__;");
    if (unit === 0) {
      assert.equal(selected.split("\n")[line], "int launcher = __LINE__;");
    }
  }
});

test("unit materialization rejects invalid or unsupported selectors", () => {
  for (const unit of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => selectBodyUnit("", unit), /Invalid native body unit/u);
  }
  for (const source of [
    "#endif",
    "#if 1\n",
    "#if OSEO_C_BODY_UNIT == 0\n#endif",
    "#ifdef OSEO_C_BODY_UNIT\n#endif",
    "#if 1\n#elif OSEO_C_BODY_UNIT == 0\n#endif",
    bodyUnit("#elif 1", 1),
    bodyUnit("#else\n#else", 1),
  ]) {
    assert.throws(() => selectBodyUnit(source, 0), /native unit/iu);
  }
});

test("outlined bodies share state across forward and back edges", () => {
  const bounded = boundBody(
    [
      "    bool fast_0 = true;",
      "    bb1:;",
      ...repeated,
      "    if (fast_0) goto bb1;",
      "    result = (OseoResult){OSEO_STATUS_NORMAL, roots[0]};",
      "    oseo_roots_release(context, &frame);",
      "    return result;",
      "    abrupt:;",
      "    oseo_roots_release(context, &frame);",
      "    return result;",
    ],
    "fixture",
    "1200u",
    false,
    false,
  );
  assert.ok(bounded != null);
  assert.match(bounded.declarations, /bool fast_0;/u);
  assert.match(bounded.declarations, /if \(fast_0\) return 1u;/u);
  assert.doesNotMatch(bounded.declarations, /goto bb|goto abrupt/u);
  assert.doesNotMatch(bounded.declarations, /oseo_roots_release/u);
  assert.equal(bounded.execution.match(/oseo_roots_release/gu)?.length, 1);
  assert.match(bounded.execution, /while \(continuation != SIZE_MAX\)/u);
});

test("outlined static data keeps one identity across compiler units", () => {
  const units = new BodyUnits();
  const bounded = boundBody(
    [
      "    static const uint16_t text[] = {123, 125};",
      ...repeated,
      "    return result;",
    ],
    "fixture",
    "1200u",
    false,
    false,
    units,
    1,
  );
  assert.ok(bounded != null);
  assert.match(bounded.declarations, /#define text fixture_text/u);
  assert.match(bounded.declarations, /extern const uint16_t text\[\]/u);
  assert.match(
    bounded.declarations,
    /#if 1200u <= OSEO_MAX_ACTIVE_FRAME_SLOTS/u,
  );
  assert.doesNotMatch(bounded.declarations, /static size_t fixture_0\(/u);
});

test("materialized helpers retain table and static data ownership", () => {
  const units = new BodyUnits();
  // Fill the owner's unit so its outlined helpers belong to the next one.
  assert.equal(units.assign(262_144), 1);
  const bounded = boundBody(
    [
      "    static const uint16_t text[] = {123, 125};",
      ...repeated,
      "    result.value = oseo_number(text[0]);",
      "    return result;",
    ],
    "fixture",
    "1200u",
    false,
    false,
    units,
    1,
  );
  assert.ok(bounded != null);
  assert.equal(units.count, 2);
  const sources = [0, 1, 2].map((unit) =>
    selectBodyUnit(bounded.declarations, unit),
  );
  for (const [unit, source] of sources.entries()) {
    assert.deepEqual(
      cTokens(source),
      cTokens(legacyUnitView(bounded.declarations, unit)),
    );
    assert.equal(source.includes("const uint16_t text[] ="), unit === 1);
    assert.equal(
      /extern const uint16_t text\[\]\s*;/u.test(source),
      unit !== 1,
    );
    assert.equal(source.includes("(*const fixture_chunks[])"), unit === 1);
    assert.equal(source.includes("size_t fixture_0(\n"), unit === 2);
    assert.match(
      source,
      /size_t fixture_0\(OseoContext \*, fixture_state \*\);/u,
    );
    assert.match(source, /#if 1200u <= OSEO_MAX_ACTIVE_FRAME_SLOTS/u);
  }
  assert.match(bounded.execution, /fixture_chunks\[continuation\]/u);
  assert.equal(bounded.execution.match(/oseo_roots_release/gu)?.length, 1);
});

test("C literal bytes do not participate in outlining rewrites", () => {
  const source = "goto bb1; f(\"goto bb1; bool fast_0\", '}');";
  const rewritten = replaceSyntax(
    source,
    /\bgoto (bb\d+);/gu,
    () => "return 1u;",
  );
  assert.equal(rewritten, "return 1u; f(\"goto bb1; bool fast_0\", '}');");
});

test("small bodies retain their existing native representation", () => {
  assert.equal(
    boundBody(["return result;"], "fixture", "32u", false, false),
    undefined,
  );
});

test("compiler unit grouping has a fixed executable text budget", () => {
  const units = new BodyUnits();
  assert.equal(units.assign(131_072), 1);
  assert.equal(units.assign(131_072), 1);
  assert.equal(units.assign(1), 2);
  assert.equal(units.count, 2);
});

test("physical units retain the 2048-operation split threshold", () => {
  const range = {
    start: { column: 1, line: 1 },
    end: { column: 1, line: 1 },
  };
  for (const count of [2048, 2049]) {
    const program: MirProgram = {
      kind: "mir-program",
      sourceId: "unit-threshold.js",
      specialization: "disabled",
      observeSpecialization: false,
      globalBindings: [],
      globalObjectBindings: [],
      functions: [],
      script: {
        kind: "mir-function",
        id: -1,
        name: "<script>",
        parameters: [],
        parameterCount: 0,
        functionLength: 0,
        rootSlotCount: count,
        range,
        blocks: [
          {
            id: 0,
            operations: Array.from({ length: count }, (_, id) => ({
              id,
              kind: "constant" as const,
              constant: { kind: "number" as const, value: id },
              arguments: [],
              detail: String(id),
              range,
            })),
            terminator: { kind: "return", value: count - 1 },
          },
        ],
      },
    };
    const emitted = cBackend.emit(program);
    assert.equal(emitted.compilationUnits != null, count === 2049);
    for (const [unit, physical] of (emitted.compilationUnits ?? []).entries()) {
      assert.deepEqual(
        cTokens(physical.source.split("\n").slice(2).join("\n")),
        cTokens(legacyUnitView(emitted.source, unit)),
      );
    }
  }
});

test("spread argument views survive a helper boundary", () => {
  const bounded = boundBody(
    [
      "    const OseoValue *argument_values_0 = NULL;",
      ...repeated,
      "    result = oseo_console_log(context, 1u, argument_values_0);",
      "    return result;",
    ],
    "fixture",
    "1200u",
    false,
    false,
  );
  assert.ok(bounded != null);
  assert.match(bounded.declarations, /const OseoValue \* argument_values_0;/u);
  assert.match(
    bounded.declarations,
    /#define argument_values_0 \(body->argument_values_0\)/u,
  );
  assert.doesNotMatch(
    bounded.declarations,
    /const OseoValue \*argument_values_0 =/u,
  );
});

test("scoped object rest scratch stays with its consuming call", () => {
  const bounded = boundBody(
    [
      ...repeated,
      "    {",
      "    OseoValue object_rest_excluded_0[1] = {roots[0]};",
      "    result = oseo_object_rest(context, roots[1], 1u, " +
        "object_rest_excluded_0);",
      "    }",
      "    return result;",
    ],
    "fixture",
    "1200u",
    false,
    false,
  );
  assert.ok(bounded != null);
  const helper = bounded.declarations
    .split(/static size_t fixture_\d+\(/u)
    .find((part) => part.includes("OseoValue object_rest_excluded_0[1]"));
  assert.ok(helper != null);
  assert.match(helper, /result = oseo_object_rest/u);
});

test("large main and agent generators have disjoint exported helpers", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "large-generator.js",
    start: { column: 1, line: 1 },
  };
  const operations: MirOperation[] = Array.from({ length: 3000 }, (_, id) => ({
    arguments: [],
    constant: { kind: "number", value: id },
    detail: String(id),
    id,
    kind: "constant",
    range,
  }));
  const base = {
    functionLength: 0,
    kind: "mir-function" as const,
    parameterCount: 0,
    parameters: [],
    range,
    rootSlotCount: 3000,
  };
  const program: MirProgram = {
    functions: [
      {
        ...base,
        generator: true,
        id: 0,
        name: "g",
        blocks: [
          { id: 0, operations, terminator: { kind: "return", value: 2999 } },
        ],
      },
    ],
    globalBindings: [],
    globalObjectBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      ...base,
      id: -1,
      name: "<script>",
      rootSlotCount: 2,
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              detail: "g",
              functionId: 0,
              functionKind: "generator",
              functionLength: 0,
              functionName: "g",
              id: 0,
              kind: "function-create",
              range,
            },
            {
              arguments: [],
              constant: { kind: "undefined" },
              detail: "undefined",
              id: 1,
              kind: "constant",
              range,
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
    },
    sourceId: "large-generator.js",
    specialization: "disabled",
  };
  const main = cBackend.emit(program);
  const agent = cBackend.emit({ ...program, agentProgram: 0 });
  assert.ok(main.compilationUnits != null);
  assert.ok(agent.compilationUnits != null);
  assert.match(main.source, /generated_c_oseo_generator_body_0_0/u);
  assert.match(agent.source, /agent_0_c_oseo_generator_body_0_0/u);
  assert.doesNotMatch(main.source, /\bsize_t oseo_generator_body_0_/u);
  assert.doesNotMatch(agent.source, /\bsize_t oseo_generator_body_0_/u);
  assert.match(main.source, /oseo_function_environment\(context, callee\)/u);
  for (const emitted of [main, agent]) {
    const unitSources = emitted.compilationUnits!;
    const assignments = [
      ...emitted.source.matchAll(
        /^#if !defined\(OSEO_C_BODY_UNIT\) \|\| OSEO_C_BODY_UNIT == (\d+)$/gmu,
      ),
    ].map((match) => Number(match[1]));
    assert.equal(unitSources.length, Math.max(...assignments) + 1);
    for (const [unit, physical] of unitSources.entries()) {
      assert.equal(
        physical.sourceName,
        `${emitted.sourceName.slice(0, -2)}-unit-${unit}.c`,
      );
      const [define, location, ...body] = physical.source.split("\n");
      assert.equal(define, `#define OSEO_C_BODY_UNIT ${unit}`);
      assert.equal(location, `#line 1 "${emitted.sourceName}"`);
      assert.equal(body.length, emitted.source.split("\n").length);
      assert.deepEqual(
        cTokens(body.join("\n")),
        cTokens(legacyUnitView(emitted.source, unit)),
      );
      assert.doesNotMatch(
        physical.source,
        /^#if !defined\(OSEO_C_BODY_UNIT\)/mu,
      );
    }
    const physicalBytes = unitSources.reduce(
      (total, physical) => total + physical.source.length,
      0,
    );
    assert.ok(physicalBytes < emitted.source.length * unitSources.length);
  }
});
