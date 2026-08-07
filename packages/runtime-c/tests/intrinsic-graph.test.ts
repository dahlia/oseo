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

test("populates the realm-owned Object prototype", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const intrinsic of [
    "OBJECT_HAS_OWN_PROPERTY",
    "OBJECT_IS_PROTOTYPE_OF",
    "OBJECT_PROPERTY_IS_ENUMERABLE",
    "OBJECT_TO_STRING",
    "OBJECT_TO_LOCALE_STRING",
    "OBJECT_VALUE_OF",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
  ]) {
    assert.match(objectBuiltins, new RegExp(`"${property}"`, "u"));
  }
  assert.match(
    objectBuiltins,
    /const OseoPropertyAttributes attributes = \{true, false, true, false\}/u,
  );
});

test("populates the realm-owned Function prototype", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const functionSource = sources.get("runtime_function.c") ?? "";

  for (const intrinsic of [
    "FUNCTION",
    "FUNCTION_APPLY",
    "FUNCTION_BIND",
    "FUNCTION_CALL",
    "FUNCTION_TO_STRING",
    "FUNCTION_HAS_INSTANCE",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "arguments",
    "caller",
    "constructor",
    "apply",
    "bind",
    "call",
    "toString",
  ]) {
    assert.match(functionSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(functionSource, /OSEO_WELL_KNOWN_HAS_INSTANCE/u);
  assert.match(functionSource, /oseo_internal_throw_type_error_function/u);
});

test("populates the realm-owned Iterator intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const iteratorSource = sources.get("runtime_iterator.c") ?? "";

  for (const intrinsic of [
    "ITERATOR",
    "ITERATOR_FROM",
    "WRAP_FOR_VALID_ITERATOR_PROTOTYPE",
    "WRAP_FOR_VALID_ITERATOR_NEXT",
    "WRAP_FOR_VALID_ITERATOR_RETURN",
    "ITERATOR_CONSTRUCTOR_GETTER",
    "ITERATOR_CONSTRUCTOR_SETTER",
    "ITERATOR_TAG_GETTER",
    "ITERATOR_TAG_SETTER",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  assert.match(iteratorSource, /OSEO_ITERATOR_CONSTRUCTOR_CODE_ID/u);
  assert.match(iteratorSource, /OSEO_ITERATOR_FROM_CODE_ID/u);
  assert.match(iteratorSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  assert.match(iteratorSource, /wrap_for_valid_iterator/u);
});

test("populates the realm-owned Number intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const numberSource = sources.get("runtime_number.c") ?? "";

  for (const intrinsic of [
    "NUMBER_PROTOTYPE",
    "NUMBER",
    "NUMBER_IS_FINITE",
    "NUMBER_IS_INTEGER",
    "NUMBER_IS_NAN",
    "NUMBER_IS_SAFE_INTEGER",
    "NUMBER_PARSE_FLOAT",
    "NUMBER_PARSE_INT",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "EPSILON",
    "MAX_SAFE_INTEGER",
    "MAX_VALUE",
    "MIN_SAFE_INTEGER",
    "MIN_VALUE",
    "NaN",
    "NEGATIVE_INFINITY",
    "POSITIVE_INFINITY",
    "isFinite",
    "isInteger",
    "isNaN",
    "isSafeInteger",
    "parseFloat",
    "parseInt",
  ]) {
    assert.match(numberSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(numberSource, /number_data/u);
});
