import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

const assets = await Promise.all(
  cRuntimeProvider
    .getRuntimeInput()
    .assets.map(
      async (asset) => [asset.name, await readFile(asset.url, "utf8")] as const,
    ),
);
const sources = new Map(assets);

test("owns every intrinsic through one realm table", () => {
  const publicHeader = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";

  assert.match(publicHeader, /OseoValue intrinsics\[OSEO_INTRINSIC_COUNT\]/u);
  assert.match(
    publicHeader,
    /OseoResult oseo_intrinsic\(OseoContext \*context,/u,
  );
  assert.match(memorySource, /index < OSEO_INTRINSIC_COUNT; index \+= 1u/u);
  assert.doesNotMatch(internalHeader, /default_intrinsics/u);
  assert.doesNotMatch(internalHeader, /OseoVirtualProperty/u);
});

test("materializes ordinary roots instead of name-compared properties", () => {
  const functionSource = sources.get("runtime_function.c") ?? "";
  const objectSource = sources.get("runtime_object.c") ?? "";
  const propertySource = sources.get("runtime_property.c") ?? "";

  assert.match(
    functionSource,
    /OSEO_INTRINSIC_OBJECT_PROTOTYPE[\s\S]*OSEO_INTRINSIC_FUNCTION_PROTOTYPE/u,
  );
  assert.match(
    objectSource,
    /oseo_object_literal_create[\s\S]*OSEO_INTRINSIC_OBJECT_PROTOTYPE/u,
  );
  assert.doesNotMatch(propertySource, /virtual_property/u);
  assert.doesNotMatch(propertySource, /string_is_ascii\(key, "push"\)/u);
  assert.doesNotMatch(propertySource, /string_is_ascii\(key, "then"\)/u);
});
