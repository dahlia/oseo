import assert from "node:assert/strict";
import test from "node:test";

import { boundBody, BodyUnits, selectBodyUnit } from "../src/bounded-body.ts";

interface Machine {
  readonly roots: number[];
  value: number;
  fast: boolean;
  readonly effects: string[];
}

interface Helper {
  readonly lines: readonly string[];
  readonly executable: string;
  readonly entries: ReadonlyMap<number, number>;
  readonly labels: ReadonlyMap<string, number>;
}

interface EdgeCounts {
  readonly local: number;
  readonly external: number;
}

/** Read only the tiny C control/effect vocabulary printed by this fixture. */
function helpers(source: string): readonly Helper[] {
  return source
    .split(/^size_t fixture_\d+\(\n/mu)
    .slice(1)
    .map((part) => {
      const end = part.indexOf("\n}\n");
      assert.ok(end >= 0);
      const lines = part.slice(0, end).split("\n");
      const labels = new Map<string, number>();
      const entries = new Map<number, number>();
      for (const [index, line] of lines.entries()) {
        const label = line.match(/^\s*(entry_\d+):;/u)?.[1];
        if (label != null) labels.set(label, index);
      }
      for (const line of lines) {
        const arm = line.match(/case (\d+)u: goto (entry_\d+);/u);
        if (arm != null) entries.set(Number(arm[1]), labels.get(arm[2]!)!);
      }
      const executable = part.slice(part.indexOf(") {\n") + 4, end + 1);
      return { lines, executable, entries, labels };
    });
}

/** Interpret emitted branches without executing C or translating it to JS. */
function execute(source: string, state: Machine, entry: number): EdgeCounts {
  const functions = helpers(source);
  const table = source.match(/fixture_chunks\[\][\s\S]*?= \{([\s\S]*?)\};/u);
  assert.ok(table != null);
  const groups = [...table[1]!.matchAll(/fixture_(\d+),/gu)].map((v) =>
    Number(v[1]),
  );
  let local = 0;
  let external = 0;
  let steps = 0;
  while (entry !== -1) {
    const group = groups[entry]!;
    const helper = functions[group]!;
    let pc = helper.entries.get(entry)!;
    assert.ok(Number.isInteger(pc));
    while (true) {
      assert.ok(steps++ < 100_000, "generated control must terminate");
      const line = helper.lines[pc++]!.trim();
      if (line === "" || line === "{" || line === "}") continue;
      if (/^entry_\d+:;$/u.test(line)) continue;
      if (line === "(void)context;") continue;
      const scalar = line.match(/^fast_0 = (true|roots\[0\] < 4u);$/u);
      if (scalar != null) {
        state.fast = scalar[1] === "true" || state.roots[0]! < 4;
        state.effects.push(line);
        continue;
      }
      const add = line.match(/^roots\[(\d+)\] \+= (\d+)u;$/u);
      if (add != null) {
        state.roots[Number(add[1])]! += Number(add[2]);
        state.effects.push(line);
        continue;
      }
      const result = line.match(/^result.value = roots\[(\d+)\];$/u);
      if (result != null) {
        state.value = state.roots[Number(result[1])]!;
        state.effects.push(line);
        continue;
      }
      const branch = line.match(/^if \((.*)\) (.*)$/u);
      if (branch != null) {
        const comparison = branch[1]!.match(/^roots\[(\d+)\] < (\d+)u$/u);
        assert.ok(comparison != null || branch[1] === "fast_0");
        const condition =
          comparison == null
            ? state.fast
            : state.roots[Number(comparison[1])]! < Number(comparison[2]);
        if (!condition) continue;
      }
      const edge = branch?.[2] ?? line;
      const jump = edge.match(/^goto (entry_\d+);$/u);
      if (jump != null) {
        pc = helper.labels.get(jump[1]!)!;
        local++;
        continue;
      }
      const returned = edge.match(/^return (\d+u|SIZE_MAX);$/u);
      assert.ok(returned != null, `unexpected fixture C: ${edge}`);
      entry = returned[1] === "SIZE_MAX" ? -1 : Number.parseInt(returned[1]!);
      external++;
      break;
    }
  }
  return { local, external };
}

/** Original labeled-block semantics, independent of the C grouping map. */
function model(state: Machine, start: number): void {
  let block = start;
  const add = (slot: number, value: number): void => {
    state.roots[slot]! += value;
    state.effects.push(`roots[${slot}] += ${value}u;`);
  };
  const result = (slot: number): void => {
    state.value = state.roots[slot]!;
    state.effects.push(`result.value = roots[${slot}];`);
  };
  for (let steps = 0; steps < 100; steps++) {
    if (block === 0) {
      state.fast = true;
      state.effects.push("fast_0 = true;");
      block = 1;
    } else if (block === 1) {
      add(0, 1);
      if (state.roots[0]! < 1) return;
      state.fast = state.roots[0]! < 4;
      state.effects.push("fast_0 = roots[0] < 4u;");
      block = state.roots[0]! < 3 ? 2 : 4;
    } else if (block === 2) {
      add(1, 10);
      block = 1;
    } else if (block === 3) block = 4;
    else if (block === 4) {
      add(2, 2);
      block = 5;
    } else if (block === 5) {
      block = state.fast ? 1 : 6;
    } else if (block === 6) {
      result(2);
      return;
    } else assert.fail(`unknown original block ${block}`);
  }
  assert.fail("original model must terminate");
}

function machine(initial: number): Machine {
  return { roots: [initial, 0, 0], value: -1, fast: false, effects: [] };
}

test("packed C matches labeled state transitions from every entry", () => {
  const padding = Array.from({ length: 750 }, () => "    (void)context;");
  const lines = [
    "    bool fast_0 = true;",
    "    goto bb1;",
    "    bb1:;",
    "    roots[0] += 1u;",
    "    if (roots[0] < 1u) return result;",
    "    fast_0 = roots[0] < 4u;",
    "    if (roots[0] < 2u) goto bb99;",
    "    if (roots[0] < 3u) goto bb2;",
    "    goto bb4;",
    "    bb99:;",
    "    bb2:;",
    "    roots[1] += 10u;",
    "    goto bb1;",
    "    bb3:;",
    ...padding,
    "    goto bb4;",
    "    bb4:;",
    ...padding,
    "    roots[2] += 2u;",
    "    bb5:;",
    "    if (fast_0) goto bb1;",
    "    goto abrupt;",
    "    abrupt:;",
    "    result.value = roots[2];",
    "    return result;",
  ];
  const bounded = boundBody(
    lines,
    "fixture",
    "32u",
    false,
    true,
    new BodyUnits(),
  );
  assert.ok(bounded != null);
  assert.match(bounded.execution, /body\.entry_index = continuation;/u);
  assert.doesNotMatch(bounded.declarations, /\babort\(/u);
  assert.equal(bounded.execution.match(/oseo_roots_release/gu)?.length, 1);
  assert.ok(helpers(bounded.declarations).length < 7);
  let local = 0;
  let external = 0;
  for (let entry = 0; entry < 7; entry++) {
    for (const initial of [-1, 0, 1, 2, 4, 5]) {
      const expected = machine(initial);
      model(expected, entry);
      const actual = machine(initial);
      const counts = execute(bounded.declarations, actual, entry);
      assert.deepEqual(actual, expected, `entry ${entry}, value ${initial}`);
      local += counts.local;
      external += counts.external;
    }
  }
  assert.ok(local > 0);
  assert.ok(external > 35, "some routes must cross packed groups");
});

test("dispatch fits the helper budget without losing work", () => {
  const lines = Array.from({ length: 1400 }, () => "    roots[0] += 1u;");
  const bounded = boundBody(
    [...lines, "    result.value = roots[0];", "    return result;"],
    "fixture",
    "32u",
    false,
    false,
    new BodyUnits(),
  );
  assert.ok(bounded != null);
  const actual = machine(0);
  execute(bounded.declarations, actual, 0);
  assert.equal(actual.roots[0], 1400);
  assert.equal(actual.value, 1400);
  for (const helper of helpers(bounded.declarations)) {
    assert.ok(helper.executable.length <= 16_384);
  }
});

test("an empty tail stays inside the serialized helper budget", (context) => {
  const bounded = boundBody(
    [
      ...Array.from({ length: 1024 }, (_, id) => [
        `    bb${id}:;`,
        "    (void)context;",
      ]).flat(),
      "    bb1024:;",
      "    {",
      ...Array.from({ length: 1500 }, () => "    roots[0] += 1u;"),
      "    }",
      "    bb1025:;",
      "    roots[0] += 1u;".padEnd(16_137),
      "    bb1026:;",
    ],
    "fixture",
    "32u",
    false,
    false,
    new BodyUnits(),
  );
  assert.ok(bounded != null);
  const functions = helpers(bounded.declarations);
  const oversize = functions.filter((helper) => helper.lines.includes("    {"));
  assert.equal(oversize.length, 1);
  context.diagnostic(
    "serialized helper characters: " +
      functions.map((helper) => helper.executable.length).join(", "),
  );
  for (const helper of functions) {
    if (helper === oversize[0]) continue;
    assert.ok(
      helper.executable.length <= 16_384,
      `serialized executable has ${helper.executable.length} characters`,
    );
  }
  const actual = machine(0);
  execute(bounded.declarations, actual, 0);
  assert.equal(actual.roots[0], 1501);
  assert.equal(actual.effects.length, 1501);
});

test("packed generators retain owner and cross-unit static identity", () => {
  const units = new BodyUnits();
  units.assign(262_144);
  const bounded = boundBody(
    [
      "    static const uint16_t text[] = {123, 125};",
      "    bool fast_0 = true;",
      ...Array.from({ length: 18000 }, () => "    (void)context;"),
      "    {",
      "    OseoValue scratch[1] = {roots[0]};",
      "    result = consume(context, scratch);",
      "    }",
      "    return result;",
    ],
    "fixture",
    "32u",
    true,
    true,
    units,
    1,
  );
  assert.ok(bounded != null);
  assert.ok(units.count >= 3);
  assert.doesNotMatch(bounded.execution, /oseo_roots_release/u);
  assert.match(bounded.execution, /\.frame = NULL/u);
  assert.match(bounded.execution, /\.completion = completion/u);
  assert.match(bounded.declarations, /bool fast_0;/u);
  const physical = Array.from({ length: units.count + 1 }, (_, unit) =>
    selectBodyUnit(bounded.declarations, unit),
  );
  assert.equal(
    physical.filter((source) => source.includes("text[] =")).length,
    1,
  );
  assert.equal(
    physical.filter((source) => source.includes("fixture_chunks[]")).length,
    1,
  );
  for (const [unit, source] of physical.entries()) {
    assert.equal(source.includes("text[] ="), unit === 1);
  }
  const scratch = helpers(bounded.declarations).filter((helper) =>
    helper.lines.some((line) => line.includes("OseoValue scratch[1]")),
  );
  assert.equal(scratch.length, 1);
  assert.ok(scratch[0]!.lines.some((line) => line.includes("consume(context")));
});

test("one oversize atomic scope is never split between helpers", () => {
  const bounded = boundBody(
    [
      "    roots[0] += 1u;",
      "    {",
      ...Array.from({ length: 1400 }, () => "    roots[0] += 1u;"),
      "    }",
      "    roots[0] += 1u;",
      "    result.value = roots[0];",
      "    return result;",
    ],
    "fixture",
    "32u",
    false,
    false,
    new BodyUnits(),
  );
  assert.ok(bounded != null);
  const functions = helpers(bounded.declarations);
  const oversize = functions.filter((helper) => helper.lines.includes("    {"));
  assert.equal(oversize.length, 1);
  assert.equal(
    oversize[0]!.lines.filter((line) => line.includes("roots[0] +=")).length,
    1400,
  );
  const state = machine(0);
  execute(bounded.declarations, state, 0);
  assert.equal(state.value, 1402);
});

test("opaque C tokens survive packing and legacy bodies stay ungrouped", () => {
  const lines = [
    '    static const char *const text = "goto bb1; bool fast_0";',
    "    /* goto bb1; { bool fast_1;",
    "       goto abrupt; } */",
    ...Array.from({ length: 1200 }, () => "    (void)context;"),
    "    bb1:;",
    "    return result;",
  ];
  for (const units of [undefined, new BodyUnits()]) {
    const bounded = boundBody(lines, "fixture", "32u", false, false, units);
    assert.ok(bounded != null);
    assert.match(bounded.declarations, /"goto bb1; bool fast_0"/u);
    assert.match(bounded.declarations, /\/\* goto bb1; \{ bool fast_1;/u);
    assert.match(bounded.declarations, /goto abrupt; \} \*\//u);
    assert.doesNotMatch(bounded.declarations, /^\s*bool fast_1;$/mu);
    assert.equal(bounded.execution.includes("body.entry_index"), units != null);
    assert.equal(
      bounded.declarations.includes("switch (body->entry_index)"),
      units != null,
    );
  }
  assert.equal(
    boundBody(["return result;"], "small", "32u", false, false),
    undefined,
  );
});

test("the entry scalar cannot alias automatic or static data", () => {
  const bounded = boundBody(
    [
      "    static const uint16_t entry_index[] = {7};",
      "    size_t entry_index_ = 0u;",
      ...Array.from({ length: 1200 }, () => "    (void)context;"),
      "    return result;",
    ],
    "fixture",
    "32u",
    false,
    false,
    new BodyUnits(),
  );
  assert.ok(bounded != null);
  assert.match(bounded.declarations, /switch \(body->entry_index__\)/u);
  assert.match(
    bounded.declarations,
    /#define entry_index fixture_entry_index/u,
  );
  assert.match(bounded.execution, /body\.entry_index__ = continuation;/u);
});
