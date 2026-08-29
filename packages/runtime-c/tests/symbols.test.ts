import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

interface ParsedFunction {
  readonly isDefinition: boolean;
  readonly isStatic: boolean;
  readonly name: string;
}

/**
 * Parse top-level C function declarations and definitions. The runtime
 * style keeps every top-level declarator at column zero, so a
 * column-zero identifier directly followed by an argument list is a
 * function, and brace or semicolon matching distinguishes a definition
 * from a declaration.
 */
function parseFunctions(source: string): readonly ParsedFunction[] {
  const results: ParsedFunction[] = [];
  const pattern =
    /^(?:static\s+)?[A-Za-z_][A-Za-z0-9_ *]*?[ *]([A-Za-z_][A-Za-z0-9_]*)\(/gmu;
  for (const match of source.matchAll(pattern)) {
    let index = match.index + match[0].length - 1;
    let depth = 0;
    while (index < source.length) {
      const character = source[index];
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      index += 1;
    }
    index += 1;
    while (index < source.length && /\s/u.test(source[index] ?? "")) {
      index += 1;
    }
    const next = source[index];
    if (next !== ";" && next !== "{") continue;
    results.push({
      isDefinition: next === "{",
      isStatic: match[0].startsWith("static"),
      name: match[1] ?? "",
    });
  }
  return results;
}

function quotedIncludes(source: string): readonly string[] {
  return [...source.matchAll(/^#include "([^"]+)"/gmu)].map(
    (match) => match[1] ?? "",
  );
}

const input = cRuntimeProvider.getRuntimeInput();
const assets = await Promise.all(
  input.assets.map(async (asset) => ({
    kind: asset.kind,
    name: asset.name,
    source: await readFile(asset.url, "utf8"),
  })),
);
const publicHeader = assets.find((asset) => asset.name === "oseo_runtime.h");
const internalHeader = assets.find(
  (asset) => asset.name === "runtime_internal.h",
);
const sources = assets.filter((asset) => asset.kind === "source");

test("keeps the reviewed ordered runtime asset list", () => {
  assert.deepEqual(
    assets.map((asset) => [asset.kind, asset.name]),
    [
      ["header", "oseo_runtime.h"],
      ["header", "runtime_internal.h"],
      ["header", "runtime_unicode_tables.h"],
      ["source", "runtime_core.c"],
      ["source", "runtime_memory.c"],
      ["source", "runtime_binding.c"],
      ["source", "runtime_string.c"],
      ["source", "runtime_string_match.c"],
      ["source", "runtime_object.c"],
      ["source", "runtime_property.c"],
      ["source", "runtime_descriptor.c"],
      ["source", "runtime_array.c"],
      ["source", "runtime_object_builtin.c"],
      ["source", "runtime_number.c"],
      ["source", "runtime_array_buffer.c"],
      ["source", "runtime_arguments.c"],
      ["source", "runtime_enumeration.c"],
      ["source", "runtime_function.c"],
      ["source", "runtime_error.c"],
      ["source", "runtime_symbol.c"],
      ["source", "runtime_iterator.c"],
      ["source", "runtime_generator.c"],
      ["source", "runtime_async_generator.c"],
      ["source", "runtime_bigint.c"],
      ["source", "runtime_primitive.c"],
      ["source", "runtime_promise.c"],
      ["source", "runtime_event_loop.c"],
      ["source", "runtime_map.c"],
      ["source", "runtime_bigint_object.c"],
      ["source", "runtime_data_view.c"],
      ["source", "runtime_regexp.c"],
      ["source", "runtime_regexp_matcher.c"],
      ["source", "runtime_math.c"],
    ],
  );
});

test("keeps the internal header out of the generated-code boundary", () => {
  assert.ok(publicHeader != null && internalHeader != null);
  assert.deepEqual(quotedIncludes(publicHeader.source), []);
  assert.deepEqual(quotedIncludes(internalHeader.source), ["oseo_runtime.h"]);
  for (const source of sources) {
    const expected =
      source.name === "runtime_string.c"
        ? ["runtime_internal.h", "runtime_unicode_tables.h"]
        : ["runtime_internal.h"];
    assert.deepEqual(
      quotedIncludes(source.source),
      expected,
      `${source.name} must include only reviewed runtime headers`,
    );
  }
});

test("defines each declared runtime symbol exactly once", () => {
  assert.ok(publicHeader != null && internalHeader != null);
  const publicDeclarations = parseFunctions(publicHeader.source).filter(
    (entry) => !entry.isDefinition && !entry.isStatic,
  );
  assert.ok(publicDeclarations.length > 0);
  const internalDeclarations = parseFunctions(internalHeader.source).filter(
    (entry) => !entry.isDefinition && !entry.isStatic,
  );
  const definitionCounts = new Map<string, number>();
  for (const source of sources) {
    for (const entry of parseFunctions(source.source)) {
      if (!entry.isDefinition || entry.isStatic) continue;
      definitionCounts.set(
        entry.name,
        (definitionCounts.get(entry.name) ?? 0) + 1,
      );
    }
  }
  for (const declaration of publicDeclarations) {
    assert.equal(
      definitionCounts.get(declaration.name),
      1,
      `public ${declaration.name} needs exactly one definition`,
    );
  }
  for (const declaration of internalDeclarations) {
    assert.match(
      declaration.name,
      /^oseo_internal_/u,
      "internal helpers use the oseo_internal_ prefix",
    );
    assert.equal(
      definitionCounts.get(declaration.name),
      1,
      `internal ${declaration.name} needs exactly one definition`,
    );
  }
  const declared = new Set(
    [...publicDeclarations, ...internalDeclarations].map((entry) => entry.name),
  );
  for (const [name, count] of definitionCounts) {
    assert.equal(count, 1, `${name} must be defined exactly once`);
    assert.ok(
      declared.has(name),
      `${name} must be declared in a runtime header`,
    );
  }
});
