import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { EmittedNativeSource } from "../../packages/compiler/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";

interface Helper {
  readonly name: string;
  readonly base: string;
  readonly definition: string;
  readonly lines: readonly string[];
  readonly labels: ReadonlyMap<number, number>;
}

/** The actual status path, excluding the normal-value return it bypasses. */
export interface TailOwnerExit {
  readonly localEdges: number;
  readonly externalEdges: number;
  readonly helper: string;
  readonly owner: string;
}

/** Function definitions have a column-zero closing brace in generated C. */
function definition(source: string, start: number): string {
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, "complete C definition");
  return source.slice(start, end + 3);
}

/**
 * Resolve Main's actual include-wrapper unit selection without running C.
 * Other preprocessor conditions remain intact; only the backend's explicit
 * OSEO_C_BODY_UNIT guards are selected. Source coordinates still belong to
 * the original included aggregate, whose bytes are never rewritten here.
 */
export function includeSelectedSources(
  emitted: EmittedNativeSource,
): readonly string[] {
  if (emitted.compilationUnits == null) return [emitted.source];
  return emitted.compilationUnits.map((unit, index) => {
    assert.equal(
      unit.source,
      `#define OSEO_C_BODY_UNIT ${index}\n` +
        `#include "${emitted.sourceName}"\n`,
      "the actual compiler input includes the original source coordinates",
    );
    const stack: { readonly selected: boolean; included: boolean }[] = [];
    const lines: string[] = [];
    const active = () => stack.every((frame) => frame.included);
    for (const line of emitted.source.split("\n")) {
      const directive = /^\s*#\s*(if|ifdef|ifndef|else|elif|endif)\b/u.exec(
        line,
      )?.[1];
      if (
        directive === "if" ||
        directive === "ifdef" ||
        directive === "ifndef"
      ) {
        const selected = new RegExp(
          String.raw`^#if !defined\(OSEO_C_BODY_UNIT\) \|\| ` +
            String.raw`OSEO_C_BODY_UNIT == (\d+)$`,
          "u",
        ).exec(line);
        if (line.includes("OSEO_C_BODY_UNIT")) assert.ok(selected);
        if (selected == null && active()) lines.push(line);
        stack.push({
          selected: selected != null,
          included: selected == null || Number(selected[1]) === index,
        });
      } else if (directive === "else" || directive === "elif") {
        const frame = stack.at(-1);
        assert.ok(frame, "balanced unit conditions");
        if (frame.selected) {
          assert.equal(directive, "else", "unit guards have only an else");
          frame.included = !frame.included;
        } else if (active()) lines.push(line);
      } else if (directive === "endif") {
        const frame = stack.pop();
        assert.ok(frame, "balanced unit conditions");
        if (!frame.selected && active()) lines.push(line);
      } else if (active()) lines.push(line);
    }
    assert.equal(stack.length, 0, "complete included source");
    return lines.join("\n");
  });
}

function physicalOwner(emitted: EmittedNativeSource, text: string): void {
  assert.ok(emitted.source.includes(text));
  const owners = includeSelectedSources(emitted).filter((source) =>
    source.includes(text),
  );
  assert.equal(
    owners.length,
    1,
    "one include-selected unit owns the definition",
  );
}

/**
 * Follow the non-normal tail status through actual chunk edges to its
 * iterative owner. No generated C or JavaScript program is executed here.
 */
export function assertTailOwnerExit(
  emitted: EmittedNativeSource,
): TailOwnerExit {
  const source = emitted.source;
  const helpers: Helper[] = [];
  for (const match of source.matchAll(
    /^(?:static )?size_t (\w*oseo_body_\w+)_(\d+)\(\n/gmu,
  )) {
    const text = definition(source, match.index);
    const lines = text.slice(text.indexOf(") {\n") + 4, -3).split("\n");
    const labels = new Map<number, number>();
    for (const [index, line] of lines.entries()) {
      const label = /^\s*entry_(\d+):;$/u.exec(line);
      if (label != null) labels.set(Number(label[1]), index + 1);
    }
    helpers.push({
      name: `${match[1]}_${match[2]}`,
      base: match[1]!,
      definition: text,
      lines,
      labels,
    });
  }
  const tails = helpers.flatMap((helper) =>
    helper.lines.flatMap((line, index) =>
      /result = oseo_tail_(?:host_)?call(?:_derived)?\(/u.test(line)
        ? [{ helper, index }]
        : [],
    ),
  );
  assert.equal(tails.length, 1, "this fixture has one recorded tail step");
  const tail = tails[0]!;
  const base = tail.helper.base;
  const tableStart = source.indexOf(`(*const ${base}_chunks[])`);
  assert.ok(tableStart >= 0);
  const table = source.slice(tableStart, source.indexOf("};", tableStart));
  const entries = [...table.matchAll(/^\s*(\w+),$/gmu)].map((m) => m[1]!);
  const byName = new Map(helpers.map((helper) => [helper.name, helper]));
  const alias = source.lastIndexOf(
    "#define result (body->result)",
    source.indexOf(tail.helper.definition),
  );
  assert.ok(alias >= 0, "the recorded result is the owner's state field");
  assert.ok(
    source.indexOf("#undef result", alias) >
      source.indexOf(tail.helper.definition),
  );
  physicalOwner(emitted, tail.helper.definition);
  const stored = tail.helper.lines[tail.index + 1]!.trim();
  assert.match(stored, /^roots\[\d+\] = result\.value;$/u);
  const status = tail.helper.lines[tail.index + 2]!.trim();
  const branch = /^if \(result.status != OSEO_STATUS_NORMAL\) (.*)$/u.exec(
    status,
  );
  assert.ok(branch, "the specific tail result controls this exit");
  let helper = tail.helper;
  let pc = tail.index + 3;
  let edge = branch[1]!;
  let localEdges = 0;
  let externalEdges = 0;
  const visited = new Set<string>();
  while (true) {
    const state = `${helper.name}/${pc}/${edge}`;
    assert.ok(!visited.has(state), "tail exit must not cycle");
    visited.add(state);
    const local = /^goto entry_(\d+);$/u.exec(edge);
    const external = /^return (\d+)u;$/u.exec(edge);
    if (local != null) {
      const next = helper.labels.get(Number(local[1]));
      assert.ok(next != null, "local tail exit names a real entry");
      pc = next;
      localEdges++;
    } else if (external != null) {
      const entry = Number(external[1]);
      const name = entries[entry];
      assert.ok(name != null, "tail continuation is in the actual table");
      const next = byName.get(name);
      assert.ok(next && next.base === base);
      helper = next;
      pc = helper.labels.size === 0 ? 0 : helper.labels.get(entry)!;
      assert.ok(Number.isInteger(pc));
      physicalOwner(emitted, helper.definition);
      externalEdges++;
    } else {
      assert.equal(edge, "return SIZE_MAX;", "preserve the tail result");
      break;
    }
    while (
      helper.lines[pc]!.trim() === "" ||
      /^\s*(?:entry_\d+:;|\(void\)context;|\(void\)body;)$/u.test(
        helper.lines[pc]!,
      )
    )
      pc++;
    // No value/status assignment, call, or cleanup can replace the result
    // on the taken status path. Only these explicit control edges remain.
    edge = helper.lines[pc++]!.trim();
  }
  const owner = base.replace("oseo_body_", "oseo_function_");
  const ownerStart = source.search(new RegExp(`OseoResult ${owner}\\(\n`, "u"));
  assert.ok(ownerStart >= 0);
  const ownerText = definition(source, ownerStart);
  physicalOwner(emitted, ownerText);
  const loop = ownerText.indexOf("while (continuation != SIZE_MAX)");
  assert.ok(loop >= 0);
  const exit = ownerText.slice(loop);
  assert.ok(exit.includes(`${base}_chunks[continuation](context, &body);`));
  assert.match(
    exit,
    new RegExp(
      String.raw`\n\s*\}\n\s*oseo_roots_release\(context, &frame\);` +
        String.raw`\n\s*return body\.result;`,
      "u",
    ),
  );
  assert.equal(exit.match(/oseo_roots_release/gu)?.length, 1);
  assert.doesNotMatch(exit, /(?:body\.)?result\s*=/u);
  assert.doesNotMatch(exit, /oseo_call_complete/u);
  assert.match(ownerText, /\.result = result/u);

  // The generated dispatcher releases this very callee's logical charge
  // before returning its unchanged result to the runtime call step.
  const call = source.indexOf(`result = ${owner}(\n`);
  assert.ok(call >= 0);
  assert.match(
    source.slice(call, source.indexOf("return result;", call) + 14),
    new RegExp(
      String.raw`oseo_frame_leave\(context, ` +
        String.raw`OSEO_CALLABLE_FRAME_COST\(\d+u\)\);` +
        String.raw`\n\s*\}\n\s*return result;`,
      "u",
    ),
  );
  const enter = source.lastIndexOf("result = oseo_frame_enter(", call);
  assert.ok(enter >= 0 && enter < call);
  const charge = /OSEO_CALLABLE_FRAME_COST\((\d+)u\)/u.exec(
    source.slice(enter, call),
  );
  assert.ok(charge);
  const leave = source.indexOf("oseo_frame_leave(", call);
  assert.ok(leave > call);
  assert.ok(
    source
      .slice(leave)
      .startsWith(
        `oseo_frame_leave(context, OSEO_CALLABLE_FRAME_COST(${charge[1]}u));`,
      ),
    "this callee releases the same logical charge it entered",
  );
  const asset = cRuntimeProvider
    .getRuntimeInput()
    .assets.find((candidate) => candidate.name === "runtime_function.c");
  assert.ok(asset);
  const runtime = readFileSync(asset.url, "utf8");
  const callStep = runtime.slice(
    runtime.indexOf("static OseoResult call_in_running_realm("),
    runtime.indexOf("static OseoResult call_once("),
  );
  assert.match(callStep, /context->function_dispatcher\(/u);
  assert.match(callStep, /oseo_call_leave\(context\);\n\s*return result;/u);
  const publicCall = runtime.slice(
    runtime.indexOf("OseoResult oseo_call_function("),
  );
  assert.match(
    publicCall,
    /return oseo_call_complete\(\n\s*context,\n\s*call_once\(/u,
  );
  return { localEdges, externalEdges, helper: tail.helper.name, owner };
}
