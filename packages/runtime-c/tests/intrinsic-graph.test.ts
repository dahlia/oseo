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

test("populates Array iteration, species, and copying methods", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";

  for (const method of [
    "concat",
    "every",
    "filter",
    "flat",
    "flatMap",
    "forEach",
    "join",
    "map",
    "slice",
    "some",
    "toLocaleString",
    "toString",
  ]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of [
    "CONCAT",
    "EVERY",
    "FILTER",
    "FLAT",
    "FLAT_MAP",
    "FOR_EACH",
    "JOIN",
    "MAP",
    "SLICE",
    "SOME",
    "TO_LOCALE_STRING",
    "TO_STRING",
  ]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }
  assert.match(arraySource, /array_iteration[\s\S]*oseo_has_property/u);
  assert.match(arraySource, /array_iteration[\s\S]*oseo_call_function/u);
  assert.match(
    arraySource,
    /array_species_create[\s\S]*OSEO_WELL_KNOWN_SPECIES/u,
  );
  assert.match(
    arraySource,
    /array_species_mapping[\s\S]*create_index_property/u,
  );
  assert.match(
    arraySource,
    /array_is_concat_spreadable[\s\S]*OSEO_WELL_KNOWN_IS_CONCAT_SPREADABLE/u,
  );
  assert.match(arraySource, /array_concat[\s\S]*array_species_create/u);
  assert.match(arraySource, /flatten_into_array[\s\S]*create_index_property/u);
  assert.match(arraySource, /array_slice[\s\S]*array_species_create/u);
  assert.match(arraySource, /array_join[\s\S]*toLocaleString/u);
});

test("populates Array sorting methods over one stable merge", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const definition = (name: string): string => {
    const opening = `static OseoResult ${name}(`;
    const begin = arraySource.indexOf(opening, arraySource.indexOf("{"));
    assert.ok(begin >= 0, `${name} needs one definition`);
    const next = arraySource.indexOf("\nstatic ", begin + opening.length);
    return arraySource.slice(begin, next < 0 ? undefined : next);
  };

  for (const method of ["sort", "toSorted"]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of ["SORT", "TO_SORTED"]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }

  // The comparator is rejected before the receiver conversion, so a
  // non-callable comparator throws before any `length` read is observable.
  const sorting = definition("array_sorting");
  assert.match(
    sorting,
    /comparator is not callable[\s\S]*oseo_internal_to_object/u,
  );
  // `sort` publishes through Set and DeletePropertyOrThrow, while `toSorted`
  // fills the plain Array it allocated without reaching species allocation.
  assert.match(sorting, /oseo_object_set/u);
  assert.match(sorting, /oseo_object_delete/u);
  assert.match(sorting, /create_index_property/u);
  assert.doesNotMatch(sorting, /array_species_create/u);

  // Collection reads every index before the first comparison; `sort` skips
  // holes and `toSorted` reads through them.
  const collection = definition("sort_indexed_properties");
  assert.match(
    collection,
    /read_through_holes[\s\S]*oseo_has_property[\s\S]*oseo_object_get/u,
  );
  assert.match(collection, /array_sort_list_append[\s\S]*array_merge_sort/u);

  // Undefined elements order without reaching the comparator, and the
  // default comparator compares the ToString results.
  const compare = definition("compare_array_elements");
  assert.match(
    compare,
    /OSEO_TAG_UNDEFINED[\s\S]*oseo_to_string[\s\S]*oseo_less_than/u,
  );
  assert.match(definition("array_merge_sort"), /compare_array_elements/u);
});

test("populates Array reduction methods over one accumulator loop", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const definition = (name: string): string => {
    const opening = `static OseoResult ${name}(`;
    const begin = arraySource.indexOf(opening, arraySource.indexOf("{"));
    assert.ok(begin >= 0, `${name} needs one definition`);
    const next = arraySource.indexOf("\nstatic ", begin + opening.length);
    return arraySource.slice(begin, next < 0 ? undefined : next);
  };

  for (const method of ["reduce", "reduceRight"]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of ["REDUCE", "REDUCE_RIGHT"]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }

  // Receiver conversion and the length read precede the callable check,
  // and the empty-without-initial TypeError follows both.
  const reduction = definition("array_reduction");
  assert.match(
    reduction,
    /oseo_internal_to_object[\s\S]*array_like_length[\s\S]*not callable/u,
  );
  assert.match(reduction, /not callable[\s\S]*needs an initial value/u);
  // Present elements travel the shared HasProperty/Get path, and the
  // callback receives four arguments with an undefined this value.
  assert.match(
    reduction,
    /oseo_has_property[\s\S]*oseo_object_get[\s\S]*oseo_call_function/u,
  );
  assert.match(reduction, /4u,/u);
  // Both methods return the rooted accumulator without allocating a
  // result array, so no species or constructor read is reachable.
  assert.doesNotMatch(reduction, /array_species_create/u);
  // One shared loop flips traversal direction for reduceRight.
  assert.match(reduction, /from_right \? length - 1\.0 : 0\.0/u);
});

test("populates Array index search methods with both comparisons", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const definition = (name: string): string => {
    const opening = `static OseoResult ${name}(`;
    const begin = arraySource.indexOf(opening, arraySource.indexOf("{"));
    assert.ok(begin >= 0, `${name} needs one definition`);
    const next = arraySource.indexOf("\nstatic ", begin + opening.length);
    return arraySource.slice(begin, next < 0 ? undefined : next);
  };

  for (const method of ["at", "includes", "indexOf", "lastIndexOf"]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of ["AT", "INCLUDES", "INDEX_OF", "LAST_INDEX_OF"]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }

  const search = definition("array_index_search");
  const relativeIndexPattern = new RegExp(
    "oseo_internal_to_object[\\s\\S]*array_like_length" +
      "[\\s\\S]*array_integer_or_infinity",
    "u",
  );
  assert.match(search, relativeIndexPattern);
  assert.match(search, /oseo_has_property[\s\S]*oseo_object_get/u);
  assert.match(search, /oseo_internal_same_value_zero/u);
  assert.match(search, /oseo_strict_equal/u);
  assert.match(search, /length - 1\.0/u);

  const at = definition("array_at");
  assert.match(at, relativeIndexPattern);
  assert.match(at, /length \+ relative/u);
  assert.match(at, /oseo_object_get/u);
  assert.doesNotMatch(at, /oseo_has_property/u);
});

test("populates Array predicate search methods over one loop", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const definition = (name: string): string => {
    const opening = `static OseoResult ${name}(`;
    const begin = arraySource.indexOf(opening, arraySource.indexOf("{"));
    assert.ok(begin >= 0, `${name} needs one definition`);
    const next = arraySource.indexOf("\nstatic ", begin + opening.length);
    return arraySource.slice(begin, next < 0 ? undefined : next);
  };

  for (const method of ["find", "findIndex", "findLast", "findLastIndex"]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of ["FIND", "FIND_INDEX", "FIND_LAST", "FIND_LAST_INDEX"]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }

  // Receiver conversion and the length read precede the callable check.
  const search = definition("array_predicate_search");
  assert.match(
    search,
    /oseo_internal_to_object[\s\S]*array_like_length[\s\S]*not callable/u,
  );
  // Every index is read with Get rather than filtered through
  // HasProperty, so a hole reaches the predicate as undefined, and the
  // predicate receives three arguments with the caller's this value.
  assert.doesNotMatch(search, /oseo_has_property/u);
  assert.match(search, /oseo_object_get[\s\S]*oseo_call_function/u);
  assert.match(search, /3u,/u);
  // The four methods return the rooted element or its index without
  // allocating a result array, so no species or constructor read is
  // reachable.
  assert.doesNotMatch(search, /array_species_create/u);
  assert.match(search, /wants_index \? oseo_number\(index\) : frame\.slots/u);
  assert.match(search, /wants_index \? oseo_number\(-1\.0\) : oseo_undefined/u);
  // One shared loop flips traversal direction for the findLast pair.
  assert.match(search, /from_last \? length - 1\.0 : 0\.0/u);
});

test("populates Array mutation methods with hole-preserving moves", () => {
  const arraySource = sources.get("runtime_array.c") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const definition = (name: string): string => {
    const opening = `static OseoResult ${name}(`;
    const begin = arraySource.indexOf(opening, arraySource.indexOf("{"));
    assert.ok(begin >= 0, `${name} needs one definition`);
    const next = arraySource.indexOf("\nstatic ", begin + opening.length);
    return arraySource.slice(begin, next < 0 ? undefined : next);
  };

  for (const method of [
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "splice",
    "unshift",
  ]) {
    assert.match(arraySource, new RegExp(`"${method}"`, "u"));
  }
  for (const code of [
    "COPY_WITHIN",
    "FILL",
    "POP",
    "PUSH",
    "REVERSE",
    "SHIFT",
    "SPLICE",
    "UNSHIFT",
  ]) {
    assert.match(internalHeader, new RegExp(`OSEO_ARRAY_${code}_CODE_ID`, "u"));
  }

  const move = definition("array_move_property");
  assert.match(move, /oseo_has_property[\s\S]*oseo_object_get/u);
  assert.match(move, /oseo_object_set/u);
  assert.match(move, /oseo_object_delete/u);

  const splice = definition("array_splice");
  assert.match(splice, /array_species_create/u);
  assert.match(splice, /create_index_property/u);
  assert.match(splice, /array_move_property/u);
  assert.match(splice, /array_set_length/u);

  const reverse = definition("array_reverse_pair");
  assert.match(reverse, /oseo_has_property[\s\S]*oseo_object_get/u);
  assert.match(reverse, /oseo_object_set/u);
  assert.match(reverse, /oseo_object_delete/u);

  for (const name of [
    "array_copy_within",
    "array_fill",
    "array_pop",
    "array_shift",
    "array_unshift",
  ]) {
    assert.match(definition(name), /oseo_internal_to_object/u);
  }
  assert.doesNotMatch(
    arraySource,
    /unadmitted_names\[\][\s\S]*"(?:pop|reverse|shift|splice|unshift)"/u,
  );
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

test("creates over the shared defineProperties collection", () => {
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  // The prototype check precedes the properties read, an undefined
  // properties argument returns the fresh object directly, and any other
  // value flows through the one ObjectDefineProperties body the plural
  // define entry point owns.
  assert.match(
    objectBuiltins,
    new RegExp(
      String.raw`OseoResult oseo_object_builtin_create\([\s\S]*` +
        "Object\\.create requires an object or null prototype[\\s\\S]*" +
        String.raw`oseo_object_create\(context, prototype\)[\s\S]*` +
        String.raw`object_define_properties\(context, 2u, define_arguments\)`,
      "u",
    ),
  );
  assert.doesNotMatch(objectBuiltins, /unsupported in M3/u);
  assert.match(objectBuiltins, /OSEO_OBJECT_CREATE_CODE_ID[\s\S]*"create"/u);
  const deferred = objectBuiltins.match(
    /deferred_static_names\[\] = \{([^}]*)\}/u,
  );
  assert.ok(deferred != null, "deferred Object statics");
  assert.doesNotMatch(deferred[1] ?? "", /"create"/u);
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

test("populates the realm-owned function intrinsic chains", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const generatorSource = sources.get("runtime_generator.c") ?? "";
  const functionSource = sources.get("runtime_function.c") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const intrinsic of [
    "GENERATOR_PROTOTYPE",
    "GENERATOR_FUNCTION_PROTOTYPE",
    "GENERATOR_FUNCTION",
    "ASYNC_FUNCTION_PROTOTYPE",
    "ASYNC_FUNCTION",
    "ASYNC_GENERATOR_PROTOTYPE",
    "ASYNC_GENERATOR_FUNCTION_PROTOTYPE",
    "ASYNC_GENERATOR_FUNCTION",
    "ASYNC_ITERATOR_PROTOTYPE",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const name of [
    "GeneratorFunction",
    "AsyncFunction",
    "AsyncGeneratorFunction",
    "Generator",
    "AsyncGenerator",
  ]) {
    assert.match(generatorSource, new RegExp(`"${name}"`, "u"));
  }
  // Every link is an ordinary own property of the object the
  // specification places it on, defined through the shared helpers
  // rather than synthesized by a property read.
  for (const property of ["constructor", "prototype", "next", "return"]) {
    assert.match(generatorSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(generatorSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  // Each constructor is an ordinary built-in whose [[Prototype]] is
  // %Function%, and only its dispatch reports the ADR 0016 boundary.
  assert.match(
    generatorSource,
    /dynamic_source_constructor[\s\S]*?OSEO_INTRINSIC_FUNCTION\b/u,
  );
  for (const code of [
    "OSEO_GENERATOR_FUNCTION_CODE_ID",
    "OSEO_ASYNC_FUNCTION_CODE_ID",
    "OSEO_ASYNC_GENERATOR_FUNCTION_CODE_ID",
  ]) {
    assert.match(internalHeader, new RegExp(code, "u"));
    assert.match(generatorSource, new RegExp(`${code}`, "u"));
  }
  assert.match(generatorSource, /compiles source text at run time/u);
  // A function of each kind inherits from its own realm prototype.
  assert.match(
    functionSource,
    /oseo_internal_generator_function_intrinsic\(context\)/u,
  );
  assert.match(
    functionSource,
    /oseo_internal_async_function_intrinsic\(context\)/u,
  );
  // Reflection over a generator function or generator object is an
  // ordinary prototype read rather than an owned boundary.
  assert.doesNotMatch(objectBuiltins, /Generator intrinsic reflection/u);
  // A generator object resolves its own [[Prototype]] where EvaluateBody
  // reads it, after FunctionDeclarationInstantiation, so the call that
  // produces it finishes the read the prologue could not.
  assert.match(
    generatorSource,
    /oseo_internal_generator_created[\s\S]*?prototype_object/u,
  );
  assert.match(
    functionSource,
    /OSEO_FUNCTION_ASYNC_GENERATOR[\s\S]*?oseo_internal_generator_created/u,
  );
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

test("populates the lazy iterator helper cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const iteratorSource = sources.get("runtime_iterator.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";

  for (const intrinsic of [
    "ITERATOR_MAP",
    "ITERATOR_FILTER",
    "ITERATOR_TAKE",
    "ITERATOR_DROP",
    "ITERATOR_FLAT_MAP",
    "ITERATOR_HELPER_PROTOTYPE",
    "ITERATOR_HELPER_NEXT",
    "ITERATOR_HELPER_RETURN",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of ["map", "filter", "take", "drop", "flatMap"]) {
    assert.match(iteratorSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(iteratorSource, /"Iterator Helper"/u);
  // Every helper is one heap kind with its own traced closure state, so
  // the collector reaches the underlying record, the callback, and the
  // in-flight flatMap inner record through the helper alone.
  assert.match(internalHeader, /OSEO_HEAP_ITERATOR_HELPER/u);
  assert.match(internalHeader, /OseoIteratorHelperState/u);
  assert.match(memorySource, /helper->underlying_iterator/u);
  assert.match(memorySource, /helper->inner_iterator/u);
  // Argument validation closes the underlying iterator before the
  // captured `next` is ever read.
  const validation = iteratorSource.indexOf(
    "result = helper_close_after_abrupt(context, slots[0], result);",
  );
  const capture = iteratorSource.indexOf(
    "result = helper_get_iterator_direct(context, slots[0], &slots[2]);",
  );
  assert.ok(validation > 0 && capture > validation);
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
    "toString",
    "valueOf",
    "toFixed",
    "toExponential",
    "toPrecision",
    "toLocaleString",
  ]) {
    assert.match(numberSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(numberSource, /number_data/u);
});

test("populates the realm-owned Math namespace object", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const functionSource = sources.get("runtime_function.c") ?? "";
  const mathSource = sources.get("runtime_math.c") ?? "";

  assert.match(header, /OSEO_INTRINSIC_MATH/u);
  assert.match(bindingSource, /oseo_internal_install_math_global/u);
  // The enum member is public, so a direct `oseo_intrinsic` request
  // reaches the same materialization the global installation uses.
  assert.match(
    functionSource,
    /OSEO_INTRINSIC_MATH\)[\s\S]{0,40}oseo_internal_math_intrinsic/u,
  );
  for (const property of [
    "E",
    "LN10",
    "LN2",
    "LOG10E",
    "LOG2E",
    "PI",
    "SQRT1_2",
    "SQRT2",
    "abs",
    "acos",
    "acosh",
    "asin",
    "asinh",
    "atan",
    "atanh",
    "atan2",
    "cbrt",
    "ceil",
    "clz32",
    "cos",
    "cosh",
    "exp",
    "expm1",
    "f16round",
    "floor",
    "fround",
    "hypot",
    "imul",
    "log",
    "log1p",
    "log10",
    "log2",
    "max",
    "min",
    "pow",
    "random",
    "round",
    "sign",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh",
    "trunc",
  ]) {
    assert.match(mathSource, new RegExp(`"${property}"`, "u"));
  }
  // The namespace is an ordinary object, so it never becomes a function
  // and its methods share the one dense code-ID range.
  assert.match(mathSource, /oseo_object_create\(context, frame\.slots\[0\]\)/u);
  assert.match(mathSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  assert.match(mathSource, /OSEO_MATH_FUNCTION_CODE_ID_LAST - operation/u);
  assert.doesNotMatch(mathSource, /OSEO_FUNCTION_ORDINARY/u);
});

test("populates the realm-owned URI handling functions", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const functionSource = sources.get("runtime_function.c") ?? "";
  const uriSource = sources.get("runtime_uri.c") ?? "";

  for (const intrinsic of [
    "DECODE_URI",
    "DECODE_URI_COMPONENT",
    "ENCODE_URI",
    "ENCODE_URI_COMPONENT",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
  ]) {
    assert.match(uriSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(internalHeader, /oseo_internal_install_uri_global/u);
  assert.match(bindingSource, /oseo_internal_install_uri_global/u);
  // The enum members are public, so a direct `oseo_intrinsic` request
  // reaches the same materialization the global installation uses.
  assert.match(
    functionSource,
    new RegExp(
      "OSEO_INTRINSIC_ENCODE_URI_COMPONENT\\)[\\s\\S]{0,60}" +
        "oseo_internal_uri_intrinsic",
      "u",
    ),
  );
  // Each function is an ordinary built-in that is not a constructor, and
  // the four share one dense code-ID range the dispatcher indexes.
  assert.match(uriSource, /OSEO_FUNCTION_INTERNAL/u);
  assert.doesNotMatch(uriSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(uriSource, /OSEO_URI_FUNCTION_CODE_ID_LAST - operation/u);
  assert.match(uriSource, /OSEO_ERROR_URI/u);
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
  assert.match(internalHeader, /OSEO_PROMISE_ALL_SETTLED_CODE_ID/u);
  assert.match(internalHeader, /OSEO_PROMISE_ANY_CODE_ID/u);
  assert.doesNotMatch(internalHeader, /OSEO_PROMISE_DEFERRED_STATIC_CODE_ID/u);
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

test("populates the realm-owned String intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const stringSource = sources.get("runtime_string.c") ?? "";
  const matchSource = sources.get("runtime_string_match.c") ?? "";
  const regexpSource = sources.get("runtime_regexp.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const intrinsic of [
    "STRING_PROTOTYPE",
    "STRING",
    "STRING_FROM_CHAR_CODE",
    "STRING_FROM_CODE_POINT",
    "STRING_RAW",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "at",
    "charAt",
    "charCodeAt",
    "codePointAt",
    "concat",
    "constructor",
    "endsWith",
    "fromCharCode",
    "fromCodePoint",
    "includes",
    "indexOf",
    "lastIndexOf",
    "length",
    "localeCompare",
    "match",
    "matchAll",
    "normalize",
    "raw",
    "replace",
    "replaceAll",
    "search",
    "slice",
    "split",
    "startsWith",
    "String",
    "substring",
    "toLocaleLowerCase",
    "toLocaleUpperCase",
    "toLowerCase",
    "toString",
    "toUpperCase",
    "trim",
    "trimEnd",
    "trimStart",
    "valueOf",
  ]) {
    assert.match(stringSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(stringSource, /static OseoResult normalize_order\(/u);
  assert.match(stringSource, /size_t counts\[256\] = \{0u\}/u);
  assert.doesNotMatch(stringSource, /normalize_append_ordered/u);
  // The constructor is an ordinary constructible function reached through
  // the realm's own global property.
  assert.match(stringSource, /OSEO_STRING_CONSTRUCTOR_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_AT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_CHAR_AT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_CHAR_CODE_AT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_CODE_POINT_AT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_TO_STRING_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_VALUE_OF_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_CONCAT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_INDEX_OF_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_LAST_INDEX_OF_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_INCLUDES_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_STARTS_WITH_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_ENDS_WITH_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_SLICE_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_SUBSTRING_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_MATCH_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_MATCH_ALL_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_SEARCH_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_SPLIT_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_REPLACE_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_REPLACE_ALL_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_LOCALE_COMPARE_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_LOWERCASE_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_UPPERCASE_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_TRIM_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_TRIM_START_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_TRIM_END_CODE_ID/u);
  assert.match(stringSource, /OSEO_STRING_NORMALIZE_CODE_ID/u);
  assert.match(header, /OSEO_INTRINSIC_REGEXP_STRING_ITERATOR_PROTOTYPE/u);
  assert.match(header, /OSEO_INTRINSIC_REGEXP_STRING_ITERATOR_NEXT/u);
  assert.match(internalHeader, /bool regexp_string_iterator;/u);
  assert.match(internalHeader, /OseoValue regexp_iterator_subject;/u);
  assert.match(internalHeader, /OseoValue regexp_iterator_regexp;/u);
  assert.match(
    memorySource,
    /mark_value\(ordinary->regexp_iterator_subject, worklist\)/u,
  );
  assert.match(
    memorySource,
    /mark_value\(ordinary->regexp_iterator_regexp, worklist\)/u,
  );
  assert.match(stringSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(internalHeader, /oseo_internal_install_string_global/u);
  assert.match(bindingSource, /oseo_internal_install_string_global/u);
  // %String.prototype% and every String exotic object take their own
  // properties from one owner rather than from a second definition
  // beside ToObject.
  assert.match(stringSource, /oseo_internal_string_wrapper_properties/u);
  assert.match(objectBuiltins, /oseo_internal_string_wrapper_properties/u);
  assert.doesNotMatch(objectBuiltins, /define_string_wrapper_properties/u);
  // Object.prototype.toString reads the [[StringData]] brand instead of
  // reporting a plain object.
  assert.match(
    objectBuiltins,
    /object_builtin_tag[\s\S]*primitive_data[\s\S]*return "String"/u,
  );
  // replace and replaceAll dispatch through Symbol.replace, share the
  // GetSubstitution body, and reach the functional replacer through the
  // ordinary call path rather than a generated-code entry point.
  assert.match(matchSource, /OSEO_WELL_KNOWN_REPLACE/u);
  assert.match(matchSource, /string_require_global_flags/u);
  assert.match(
    matchSource,
    /string_replace\([\s\S]*string_protocol_method[\s\S]*match_subject/u,
  );
  assert.match(
    matchSource,
    new RegExp(
      String.raw`string_replace\([\s\S]*oseo_call_function` +
        String.raw`[\s\S]*oseo_internal_get_substitution`,
      "u",
    ),
  );
  assert.doesNotMatch(header, /oseo_string_replace/u);
  // The unadmitted-method placeholder no longer covers either name.
  assert.doesNotMatch(stringSource, /unadmitted_names\[\] = \{[^}]*"replace"/u);
  // %RegExp.prototype% carries the real [Symbol.replace] method, so a
  // RegExp operand reaches it through GetMethod instead of falling through
  // to the String search this node admits.
  assert.match(
    regexpSource,
    /symbol_methods\[\] = \{[^}]*"\[Symbol\.replace\]"/u,
  );
  assert.match(regexpSource, /OSEO_REGEXP_REPLACE_CODE_ID/u);
  assert.match(internalHeader, /OSEO_REGEXP_REPLACE_CODE_ID/u);
});

test("routes the RegExp symbol methods and String dispatch", () => {
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const matchSource = sources.get("runtime_string_match.c") ?? "";
  const regexpSource = sources.get("runtime_regexp.c") ?? "";
  const symbolSource = sources.get("runtime_regexp_symbol.c") ?? "";
  const stringSource = sources.get("runtime_string.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";

  // The five symbol methods and the escape static share one contiguous
  // block of the RegExp range, which one range test hands to the
  // symbol-method component.
  for (const code of [
    "OSEO_REGEXP_MATCH_CODE_ID",
    "OSEO_REGEXP_MATCH_ALL_CODE_ID",
    "OSEO_REGEXP_REPLACE_CODE_ID",
    "OSEO_REGEXP_SEARCH_CODE_ID",
    "OSEO_REGEXP_SPLIT_CODE_ID",
    "OSEO_REGEXP_ESCAPE_CODE_ID",
  ]) {
    assert.match(internalHeader, new RegExp(`#define ${code} `, "u"));
    assert.match(symbolSource, new RegExp(code, "u"));
  }
  assert.doesNotMatch(internalHeader, /_DEFERRED_CODE_ID/u);
  assert.match(
    regexpSource,
    new RegExp(
      String.raw`OSEO_REGEXP_ESCAPE_CODE_ID &&[\s\S]*?` +
        "oseo_internal_regexp_symbol_dispatch",
      "u",
    ),
  );
  // Every method executes through RegExpExec rather than through the
  // built-in matcher directly, so an overridden `exec` is observed.
  assert.match(symbolSource, /oseo_internal_regexp_exec/u);
  assert.match(symbolSource, /symbol_species_constructor/u);
  assert.match(symbolSource, /oseo_constructor_result/u);
  // String.prototype match, matchAll, and search reach the symbol methods
  // through RegExpCreate and Invoke instead of a String-only fallback.
  assert.match(
    matchSource,
    new RegExp(
      String.raw`string_regexp_dispatch\([\s\S]*` +
        String.raw`oseo_internal_regexp_create[\s\S]*oseo_call_function`,
      "u",
    ),
  );
  assert.doesNotMatch(matchSource, /fallback_regexp_/u);
  assert.doesNotMatch(matchSource, /is not admitted yet/u);
  // The RegExp String iterator holds the iterating RegExp and its frozen
  // global and unicode decisions, and the collector traces both values.
  assert.match(internalHeader, /bool regexp_iterator_global;/u);
  assert.match(internalHeader, /bool regexp_iterator_unicode;/u);
  assert.match(
    matchSource,
    new RegExp(
      "oseo_internal_regexp_string_iterator_create" +
        String.raw`[\s\S]*regexp_iterator_regexp = `,
      "u",
    ),
  );
  assert.match(
    memorySource,
    /mark_value\(ordinary->regexp_iterator_regexp, worklist\)/u,
  );
  // One UTF-16 accumulator serves every component that assembles a
  // result in pieces.
  assert.match(stringSource, /OseoResult oseo_internal_string_builder_append/u);
  assert.match(internalHeader, /\} OseoStringBuilder;/u);
  assert.equal((symbolSource.match(/typedef struct \{/gu) ?? []).length, 0);
});

test("populates the realm-owned Map intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const mapSource = sources.get("runtime_map.c") ?? "";

  for (const intrinsic of [
    "MAP_ITERATOR_PROTOTYPE",
    "MAP_ITERATOR_NEXT",
    "MAP_PROTOTYPE",
    "MAP_GET",
    "MAP_SET",
    "MAP_HAS",
    "MAP_DELETE",
    "MAP_CLEAR",
    "MAP_FOR_EACH",
    "MAP_ENTRIES",
    "MAP_KEYS",
    "MAP_VALUES",
    "MAP_SIZE_GETTER",
    "MAP",
    "MAP_GROUP_BY",
    "MAP_SPECIES",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "get",
    "set",
    "has",
    "delete",
    "clear",
    "forEach",
    "entries",
    "keys",
    "values",
    "size",
    "groupBy",
    "constructor",
    "Map",
    "next",
  ]) {
    assert.match(mapSource, new RegExp(`"${property}"`, "u"));
  }
  // The constructor is an ordinary constructible function reached through
  // the realm's own global property, `entries` and `[Symbol.iterator]`
  // share one function object, and the species accessor is a getter-only
  // symbol-keyed property on the constructor.
  assert.match(mapSource, /OSEO_MAP_CONSTRUCTOR_CODE_ID/u);
  assert.match(mapSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(mapSource, /OSEO_INTRINSIC_MAP_ENTRIES\] = frame\.slots\[2\]/u);
  assert.match(mapSource, /OSEO_WELL_KNOWN_ITERATOR/u);
  assert.match(mapSource, /OSEO_WELL_KNOWN_SPECIES/u);
  assert.match(mapSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  assert.match(mapSource, /oseo_object_define_accessor/u);
  assert.match(internalHeader, /oseo_internal_install_map_global/u);
  assert.match(bindingSource, /oseo_internal_install_map_global/u);
});

test("keeps Map deletions as in-place tombstones for live iterators", () => {
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";
  const mapSource = sources.get("runtime_map.c") ?? "";

  // A deleted or cleared record is marked dead in place instead of being
  // removed, which is what keeps %MapIteratorPrototype%.next's own plain
  // index valid across a concurrent delete.
  assert.match(internalHeader, /OSEO_HEAP_MAP = 19/u);
  assert.match(internalHeader, /OSEO_HEAP_MAP_ITERATOR = 20/u);
  assert.match(internalHeader, /bool live;/u);
  assert.doesNotMatch(mapSource, /oseo_internal_remove_property/u);
  assert.match(
    mapSource,
    new RegExp(
      String.raw`map_prototype_delete[\s\S]*?` +
        String.raw`entries\[index\]\.live = false`,
      "u",
    ),
  );
  assert.match(
    memorySource,
    new RegExp(
      String.raw`destroy_heap_object[\s\S]*OSEO_HEAP_MAP[\s\S]*` +
        String.raw`free\(\(\(OseoMap \*\)object\)->entries\)`,
      "u",
    ),
  );
});

test("populates the realm-owned BigInt intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const bigintSource = sources.get("runtime_bigint_object.c") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";

  for (const intrinsic of [
    "BIGINT_PROTOTYPE",
    "BIGINT",
    "BIGINT_AS_INT_N",
    "BIGINT_AS_UINT_N",
    "BIGINT_TO_STRING",
    "BIGINT_TO_LOCALE_STRING",
    "BIGINT_VALUE_OF",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "BigInt",
    "asIntN",
    "asUintN",
    "constructor",
    "toLocaleString",
    "toString",
    "valueOf",
  ]) {
    assert.match(bigintSource, new RegExp(`"${property}"`, "u"));
  }
  // The ordinary kind makes IsConstructor true. Its dispatch rejects every
  // construction before conversion, and its synthetic prototype property is
  // fixed to the specified %BigInt.prototype% identity.
  assert.match(bigintSource, /OSEO_FUNCTION_INTERNAL/u);
  assert.match(bigintSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(
    bigintSource,
    /function_object\(frame\.slots\[0\]\)->prototype_object/u,
  );
  assert.match(bigintSource, /constructor->prototype_writable = false/u);
  assert.match(bigintSource, /if \(constructing\)[\s\S]*OSEO_ERROR_TYPE/u);
  assert.match(bigintSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  // %BigInt.prototype% is an ordinary object: the wrapper-prototype
  // builder hands it to this cluster instead of branding it with a
  // primitive value the way it brands %Boolean.prototype%.
  assert.match(objectBuiltins, /intrinsic == OSEO_INTRINSIC_BIGINT_PROTOTYPE/u);
  assert.doesNotMatch(objectBuiltins, /oseo_bigint_literal/u);
  // The object model reads no limb; the representation stays behind the
  // private operations runtime_bigint.c exports.
  assert.doesNotMatch(bigintSource, /limbs/u);
  assert.match(internalHeader, /oseo_internal_bigint_as_width/u);
  assert.match(internalHeader, /oseo_internal_install_bigint_global/u);
  assert.match(bindingSource, /oseo_internal_install_bigint_global/u);
});

test("populates the realm-owned DataView intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";
  const bufferSource = sources.get("runtime_array_buffer.c") ?? "";
  const viewSource = sources.get("runtime_data_view.c") ?? "";

  for (const intrinsic of [
    "DATA_VIEW_PROTOTYPE",
    "DATA_VIEW",
    "DATA_VIEW_BUFFER",
    "DATA_VIEW_BYTE_LENGTH",
    "DATA_VIEW_BYTE_OFFSET",
    "DATA_VIEW_GET_INT8",
    "DATA_VIEW_GET_BIG_UINT64",
    "DATA_VIEW_SET_INT8",
    "DATA_VIEW_SET_BIG_UINT64",
  ]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "DataView",
    "buffer",
    "byteLength",
    "byteOffset",
    "constructor",
    "getBigInt64",
    "getBigUint64",
    "getFloat16",
    "getFloat32",
    "getFloat64",
    "getInt8",
    "getInt16",
    "getInt32",
    "getUint8",
    "getUint16",
    "getUint32",
    "setBigInt64",
    "setBigUint64",
    "setFloat16",
    "setFloat32",
    "setFloat64",
    "setInt8",
    "setInt16",
    "setInt32",
    "setUint8",
    "setUint16",
    "setUint32",
  ]) {
    assert.match(viewSource, new RegExp(`"${property}"`, "u"));
  }
  assert.match(viewSource, /OSEO_FUNCTION_ORDINARY/u);
  assert.match(
    viewSource,
    /OseoFunction \*constructor = function_object\(frame\.slots\[1\]\)/u,
  );
  assert.match(viewSource, /constructor->prototype_writable = false/u);
  assert.match(viewSource, /OSEO_WELL_KNOWN_TO_STRING_TAG/u);
  // A view owns no Data Block: nothing in the component allocates, frees,
  // or resizes one, and the collector traces the buffer instead of
  // releasing anything of the view's own.
  assert.doesNotMatch(viewSource, /\bfree\s*\(/u);
  assert.doesNotMatch(viewSource, /oseo_internal_array_buffer_release/u);
  assert.match(
    memorySource,
    new RegExp(
      String.raw`OSEO_HEAP_DATA_VIEW\) \{` +
        String.raw`[\s\S]*?mark_value\(\(\(OseoDataView \*\)object\)->buffer`,
      "u",
    ),
  );
  // Detachment and out-of-bounds are rechecked at every access rather than
  // cached in the view, and the element bytes move through a local copy so
  // no access assumes an aligned block.
  assert.match(viewSource, /data_view_out_of_bounds/u);
  assert.match(viewSource, /memcpy\(raw, buffer->data \+ offset, /u);
  assert.match(viewSource, /memcpy\(buffer->data \+ offset, raw, /u);
  // The BigInt element types reach the representation only through the
  // owning component's exported raw-integer operations.
  assert.doesNotMatch(viewSource, /limbs/u);
  assert.match(internalHeader, /oseo_internal_bigint_to_raw_uint64/u);
  assert.match(internalHeader, /oseo_internal_bigint_from_uint64/u);
  assert.match(internalHeader, /oseo_internal_install_data_view_global/u);
  assert.match(bindingSource, /oseo_internal_install_data_view_global/u);
  // ArrayBuffer.isView now reports the one admitted view kind.
  assert.match(bufferSource, /is_data_view\(arguments\[0\]\)/u);
});

test("populates the realm-owned RegExp intrinsic cluster", () => {
  const header = sources.get("oseo_runtime.h") ?? "";
  const internalHeader = sources.get("runtime_internal.h") ?? "";
  const bindingSource = sources.get("runtime_binding.c") ?? "";
  const memorySource = sources.get("runtime_memory.c") ?? "";
  const objectSource = sources.get("runtime_object_builtin.c") ?? "";
  const regexpSource = sources.get("runtime_regexp.c") ?? "";

  for (const intrinsic of ["REGEXP_PROTOTYPE", "REGEXP", "REGEXP_SPECIES"]) {
    assert.match(header, new RegExp(`OSEO_INTRINSIC_${intrinsic}`, "u"));
  }
  for (const property of [
    "RegExp",
    "constructor",
    "dotAll",
    "exec",
    "flags",
    "global",
    "hasIndices",
    "ignoreCase",
    "lastIndex",
    "multiline",
    "source",
    "sticky",
    "test",
    "toString",
    "unicode",
    "unicodeSets",
  ]) {
    assert.match(regexpSource, new RegExp(`"${property}"`, "u"));
  }
  for (const symbol of ["MATCH", "MATCH_ALL", "SEARCH", "SPLIT"]) {
    assert.match(regexpSource, new RegExp(`OSEO_WELL_KNOWN_${symbol}`, "u"));
  }
  assert.match(regexpSource, /OSEO_WELL_KNOWN_SPECIES/u);
  assert.match(regexpSource, /regexp_prototype_from_target/u);
  assert.match(regexpSource, /regexp_allocate[\s\S]*regexp_initialize/u);
  assert.match(
    regexpSource,
    /\(OseoPropertyAttributes\)\{false, false, true, false\}/u,
  );
  assert.match(regexpSource, /OSEO_ERROR_SYNTAX/u);
  assert.match(regexpSource, /OSEO_HEAP_REGEXP_MATCHER/u);
  assert.match(internalHeader, /oseo_internal_is_regexp/u);
  assert.match(internalHeader, /oseo_internal_install_regexp_global/u);
  assert.match(bindingSource, /oseo_internal_install_regexp_global/u);
  assert.match(objectSource, /is_regexp\(receiver\)[\s\S]*"RegExp"/u);
  assert.match(
    memorySource,
    /OSEO_HEAP_REGEXP_MATCHER[\s\S]*mark_value\(matcher->source/u,
  );
  assert.match(
    memorySource,
    new RegExp(
      String.raw`OSEO_HEAP_REGEXP\)[\s\S]*mark_value\(` +
        String.raw`\(\(OseoRegExp \*\)object\)->matcher`,
      "u",
    ),
  );
});

test("routes generic string coercion through the realm-owned methods", () => {
  const primitiveSource = sources.get("runtime_primitive.c") ?? "";
  const objectBuiltins = sources.get("runtime_object_builtin.c") ?? "";
  // The first occurrence is the forward declaration the mutually
  // recursive conversion pair needs, so the body is the last one.
  const opening = "static OseoResult to_primitive_value(";
  const begin = primitiveSource.lastIndexOf(opening);
  assert.ok(begin >= 0, "to_primitive_value needs one definition");
  const next = primitiveSource.indexOf("\nOseoResult ", begin);
  const conversion = primitiveSource.slice(begin, next < 0 ? undefined : next);

  // OrdinaryToPrimitive reads each method with the ordinary property
  // lookup and calls whatever it finds, so a receiver whose nearest
  // toString is %Object.prototype.toString% reaches that function.
  assert.match(
    conversion,
    new RegExp(
      String.raw`OSEO_WELL_KNOWN_TO_PRIMITIVE[\s\S]*oseo_object_get` +
        String.raw`[\s\S]*oseo_call_function`,
      "u",
    ),
  );

  // No private text substitute may shadow the materialized methods: the
  // retired virtual tag helper, its intrinsic-kind selector, and the
  // function and promise diagnostic with its numeric shortcut are gone,
  // and the conversion no longer branches on the found method's identity.
  assert.doesNotMatch(primitiveSource, /default_object_tag_text/u);
  assert.doesNotMatch(primitiveSource, /DefaultConversionKind/u);
  assert.doesNotMatch(primitiveSource, /Function and promise text/u);
  assert.doesNotMatch(conversion, /OSEO_INTRINSIC_OBJECT_TO_STRING/u);

  // The tag itself stays one composition of builtinTag with a string
  // @@toStringTag inside Object.prototype.toString.
  assert.match(
    objectBuiltins,
    new RegExp(
      String.raw`object_prototype_to_string[\s\S]*` +
        String.raw`OSEO_WELL_KNOWN_TO_STRING_TAG[\s\S]*object_tag_text`,
      "u",
    ),
  );
});
