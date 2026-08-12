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

test("populates the realm-owned Object constructor cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const functions = sources.get("runtime_function.c") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const intrinsic of [
    "OBJECT",
    "OBJECT_GET_PROTOTYPE_OF",
    "OBJECT_IS",
    "OBJECT_SET_PROTOTYPE_OF",
    "BOOLEAN_PROTOTYPE",
    "STRING_PROTOTYPE",
    "BIGINT_PROTOTYPE",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of ["getPrototypeOf", "is", "setPrototypeOf"]) {
    assert.match(objectBuiltins, new RegExp(`"${property}"`, "u"));
  }
  assert.match(objectBuiltins, /oseo_internal_to_object/u);
  assert.match(objectBuiltins, /primitive_value/u);
  assert.match(objectBuiltins, /oseo_internal_same_value/u);
  assert.match(functions, /intrinsic >= OSEO_INTRINSIC_BOOLEAN_PROTOTYPE/u);
  assert.match(functions, /intrinsic <= OSEO_INTRINSIC_ASYNC_ITERATOR_SELF/u);
});

test("orders Object.defineProperty conversion before descriptors", () => {
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  assert.match(
    objectBuiltins,
    new RegExp(
      "oseo_object_builtin_define_property[\\s\\S]*" +
        "oseo_property_key[\\s\\S]*" +
        "Object\\.defineProperty requires an object descriptor",
      "u",
    ),
  );
  assert.match(
    objectBuiltins,
    /OSEO_OBJECT_DEFINE_PROPERTY_CODE_ID[\s\S]*"defineProperty"/u,
  );
});

test("reports descriptors through one FromPropertyDescriptor body", () => {
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  // Both queries report one property through the same field order, and
  // the plural one owns the ordinary own-key walk rather than repeating
  // the singular entry point per key.
  assert.match(
    objectBuiltins,
    new RegExp(
      "from_property_descriptor[\\s\\S]*" +
        '"get"[\\s\\S]*"value"[\\s\\S]*"set"[\\s\\S]*"writable"[\\s\\S]*' +
        '"enumerable"[\\s\\S]*"configurable"',
      "u",
    ),
  );
  assert.match(
    objectBuiltins,
    new RegExp(
      String.raw`oseo_internal_to_object\(context, value\)[\s\S]*` +
        String.raw`snapshot_own_keys\(context, &frame, key_count\)[\s\S]*` +
        String.raw`oseo_internal_own_descriptor\([\s\S]*` +
        String.raw`from_property_descriptor\(context, &descriptor`,
      "u",
    ),
  );
  assert.match(
    objectBuiltins,
    new RegExp(
      "OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS_CODE_ID[\\s\\S]*" +
        '"getOwnPropertyDescriptors"',
      "u",
    ),
  );
  const deferred = objectBuiltins.match(
    /deferred_static_names\[\] = \{([^}]*)\}/u,
  );
  assert.ok(deferred != null, "deferred Object statics");
  assert.doesNotMatch(deferred[1] ?? "", /getOwnPropertyDescriptors/u);
});

test("collects every defineProperties descriptor before mutation", () => {
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  // One ToPropertyDescriptor body serves both define entry points, the
  // plural one reuses the ordinary own-key walk, and its whole
  // collection loop completes before the first definition runs.
  assert.match(
    objectBuiltins,
    new RegExp(
      "oseo_object_builtin_define_property[\\s\\S]*" +
        "to_property_descriptor\\([\\s\\S]*" +
        "define_converted_property\\(",
      "u",
    ),
  );
  assert.match(
    objectBuiltins,
    new RegExp(
      String.raw`static OseoResult object_define_properties\([\s\S]*` +
        "Object\\.defineProperties requires an object target[\\s\\S]*" +
        String.raw`snapshot_own_keys\(context, &frame, key_count\)[\s\S]*` +
        "A property descriptor must be an object[\\s\\S]*" +
        String.raw`to_property_descriptor\([\s\S]*` +
        "index < collected[\\s\\S]*" +
        String.raw`define_converted_property\(`,
      "u",
    ),
  );
  assert.match(
    objectBuiltins,
    /OSEO_OBJECT_DEFINE_PROPERTIES_CODE_ID[\s\S]*"defineProperties"/u,
  );
  const deferred = objectBuiltins.match(
    /deferred_static_names\[\] = \{([^}]*)\}/u,
  );
  assert.ok(deferred != null, "deferred Object statics");
  assert.doesNotMatch(deferred[1] ?? "", /defineProperties/u);
});

test("owns Object integrity transitions and queries", () => {
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const name of [
    "freeze",
    "isExtensible",
    "isFrozen",
    "isSealed",
    "preventExtensions",
    "seal",
  ]) {
    assert.match(objectBuiltins, new RegExp(`"${name}"`, "u"));
  }
  assert.match(objectBuiltins, /object_set_integrity_level/u);
  assert.match(objectBuiltins, /object_test_integrity_level/u);
  assert.match(objectBuiltins, /object->extensible = false/u);
  const deferred = objectBuiltins.match(
    /deferred_static_names\[\] = \{([^}]*)\}/u,
  );
  assert.ok(deferred != null, "deferred Object statics");
  assert.doesNotMatch(
    deferred[1] ?? "",
    /freeze|isExtensible|isFrozen|isSealed|preventExtensions|seal/u,
  );
});

test("installs the module namespace toStringTag descriptor", () => {
  const bindings = sources.get("runtime_binding.c") ?? "";

  assert.match(
    bindings,
    /oseo_module_namespace_create[\s\S]*OSEO_WELL_KNOWN_TO_STRING_TAG/u,
  );
  assert.match(bindings, /oseo_module_namespace_create[\s\S]*"Module"/u);
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

test("populates the realm-owned Array constructor", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const arraySource = sources.get("runtime_array.c") ?? "";

  for (const intrinsic of [
    "ARRAY",
    "ARRAY_FROM",
    "ARRAY_IS_ARRAY",
    "ARRAY_OF",
    "ARRAY_SPECIES_GETTER",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of ["constructor", "from", "isArray", "of", "push"]) {
    assert.match(arraySource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(arraySource, /OSEO_WELL_KNOWN_SPECIES/u);
  assert.match(arraySource, /array_create_with_prototype\(\s*context,\s*0u,/u);
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

test("populates the realm-owned ArrayBuffer intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const bufferSource = sources.get("runtime_array_buffer.c") ?? "";

  for (const intrinsic of [
    "ARRAY_BUFFER_PROTOTYPE",
    "ARRAY_BUFFER",
    "ARRAY_BUFFER_IS_VIEW",
    "ARRAY_BUFFER_BYTE_LENGTH",
    "ARRAY_BUFFER_DETACHED",
    "ARRAY_BUFFER_MAX_BYTE_LENGTH",
    "ARRAY_BUFFER_RESIZABLE",
    "ARRAY_BUFFER_RESIZE",
    "ARRAY_BUFFER_SLICE",
    "ARRAY_BUFFER_TRANSFER",
    "ARRAY_BUFFER_TRANSFER_TO_FIXED_LENGTH",
    "ARRAY_BUFFER_SPECIES",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "ArrayBuffer",
    "byteLength",
    "constructor",
    "detached",
    "isView",
    "maxByteLength",
    "prototype",
    "resizable",
    "resize",
    "slice",
    "transfer",
    "transferToFixedLength",
  ]) {
    assert.match(bufferSource, new RegExp(`"${property}"`, "u"));
  }
  // The constructor is an ordinary constructible function reached through
  // the realm's own global property, the four state queries are
  // getter-only accessors, and the species accessor is a getter-only
  // symbol-keyed property on the constructor.
  assert.match(bufferSource, /OSEO_ARRAY_BUFFER_CONSTRUCTOR_CODE_ID/u);
  assert.match(bufferSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(bufferSource, /OSEO_FUNCTION_NAME_PREFIX_GET/u);
  assert.match(bufferSource, /OSEO_WELL_KNOWN_SPECIES/u);
  assert.match(bufferSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  assert.match(bufferSource, /oseo_object_define_accessor/u);
  assert.match(internalHeader, /oseo_internal_install_array_buffer_global/u);
  assert.match(bindingSource, /oseo_internal_install_array_buffer_global/u);
});

test("owns each ArrayBuffer data block through exactly one buffer", () => {
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bufferSource = sources.get("runtime_array_buffer.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";

  // The Data Block is a separate host allocation, so the heap kind, the
  // collector's destruction path, and the detaching release all have to
  // name the same single owner.
  assert.match(internalHeader, /OSEO_HEAP_ARRAY_BUFFER = 18/u);
  assert.match(internalHeader, /uint8_t \*data;/u);
  assert.match(
    memorySource,
    new RegExp(
      String.raw`destroy_heap_object[\s\S]*OSEO_HEAP_ARRAY_BUFFER[\s\S]*` +
        String.raw`oseo_internal_array_buffer_release`,
      "u",
    ),
  );
  // Releasing leaves the record detached, so the collector cannot free a
  // block a transfer already gave up.
  assert.match(
    bufferSource,
    new RegExp(
      String.raw`oseo_internal_array_buffer_release\([\s\S]*?` +
        String.raw`buffer->data = NULL;[\s\S]*?buffer->detached = true;`,
      "u",
    ),
  );
  // Every copy allocates its own block instead of sharing the source's.
  assert.match(bufferSource, /memcpy\(to->data, from->data/u);
  assert.doesNotMatch(bufferSource, /->data = [a-z_]*->data/u);
  assert.doesNotMatch(bufferSource, /realloc/u);
});

test("populates the realm-owned Promise intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const promiseSource = sources.get("runtime_promise.c") ?? "";

  for (const intrinsic of [
    "PROMISE_PROTOTYPE",
    "PROMISE",
    "PROMISE_ALL",
    "PROMISE_ALL_SETTLED",
    "PROMISE_ANY",
    "PROMISE_RACE",
    "PROMISE_REJECT",
    "PROMISE_RESOLVE",
    "PROMISE_TRY",
    "PROMISE_WITH_RESOLVERS",
    "PROMISE_SPECIES",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "all",
    "allSettled",
    "any",
    "race",
    "reject",
    "resolve",
    "try",
    "withResolvers",
    "constructor",
    "then",
    "catch",
    "finally",
    "promise",
    "Promise",
  ]) {
    assert.match(promiseSource, new RegExp(`"${property}"`, "u"));
  }
  // The constructor is an ordinary constructible function reached through
  // the realm's own global property, and the species accessor is a
  // getter-only symbol-keyed property on it.
  assert.match(promiseSource, /OSEO_PROMISE_CONSTRUCTOR_CODE_ID/u);
  assert.match(promiseSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(promiseSource, /OSEO_WELL_KNOWN_SPECIES/u);
  assert.match(promiseSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  assert.match(promiseSource, /oseo_object_define_accessor/u);
  assert.match(internalHeader, /oseo_internal_install_promise_global/u);
  assert.match(bindingSource, /oseo_internal_install_promise_global/u);
  // The retired M4 fast paths no longer exist as generated-code entry
  // points, so no program can bypass the materialized properties.
  assert.doesNotMatch(header, /oseo_promise_construct/u);
  assert.doesNotMatch(header, /oseo_promise_race/u);
  assert.doesNotMatch(header, /oseo_promise_reject\(/u);
});
