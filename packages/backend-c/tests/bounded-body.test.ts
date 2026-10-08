import assert from "node:assert/strict";
import test from "node:test";
import type { MirOperation, MirProgram } from "@oseo/compiler";

import { boundBody, BodyUnits, replaceSyntax } from "../src/bounded-body.ts";
import { cBackend } from "../src/index.ts";

const repeated = Array.from(
  { length: 1200 },
  (_, index) => `    roots[${index}] = result.value;`,
);

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
});
