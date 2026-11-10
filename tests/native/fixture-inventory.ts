/**
 * Mirror of the common fixture list in *tests/native.ts*, with each entry's
 * source module, for the M5 performance report.
 *
 * *tests/native.ts* is digest-bound replacement evidence in
 * *docs/m5c-closure/exclusion-audit.yaml*, so it keeps its own list and this
 * module repeats it. *tests/m5-performance-report.test.ts* fails when the two
 * lists differ in entries or order.
 */

import type { Fixture } from "./fixture.ts";

import { staticCore } from "./fixtures/dynamic-source-static-core.ts";
import {
  residualCompletionFixtures,
  residualClassFixtures,
  residualValueOracleFixture,
} from "./fixtures/dynamic-source-residual.ts";
import * as records from "./fixtures/completion-records.ts";
import { arrayBufferFixtures } from "./fixtures/array-buffer.ts";
import { asyncFixtures } from "./fixtures/async.ts";
import { asyncGeneratorFixtures } from "./fixtures/async-generators.ts";
import { asyncIterationFixtures } from "./fixtures/async-iteration.ts";
import { bindingFixtures } from "./fixtures/bindings.ts";
const { bindingReferenceEvidenceFixtures } =
  await import("./fixtures/binding-reference-evidence.ts");
import { bigintFixtures } from "./fixtures/bigint.ts";
import { bigintIntrinsicFixtures } from "./fixtures/bigint-intrinsic.ts";
import * as booleanFixture from "./fixtures/boolean-intrinsic.ts";
import { classFixtures } from "./fixtures/classes.ts";
const { privateNameLifetimeFixtures } =
  await import("./fixtures/class-private-name-lifetimes.ts");
import { dataViewFixtures } from "./fixtures/data-view.ts";
import { dateFamilyFixtures } from "./fixtures/date-family.ts";
import { expressionFixtures } from "./fixtures/expressions.ts";
const { ds22BoundaryCoreFixtures } =
  await import("./fixtures/ds22-boundary-core.ts");
import * as cs from "./fixtures/construction-static-contracts.ts";
import { functionFixtures } from "./fixtures/functions.ts";
import { generatorFixtures } from "./fixtures/generators.ts";
import * as evalFixture from "./fixtures/direct-eval-non-string.ts";
import { callableCases } from "./fixtures/callable-object-evidence.ts";
import * as globalRecord from "./fixtures/global-object-record.ts";
import * as globalThisFixture from "./fixtures/globalthis-binding.ts";
import * as eagerHelpers from "./fixtures/iterator-helpers-eager.ts";
import * as lazyHelpers from "./fixtures/iterator-helpers-lazy.ts";
import * as iteratorFixtures from "./fixtures/iterator-intrinsic.ts";
import * as mapFixtures from "./fixtures/map-intrinsic.ts";
import * as numberFixtures from "./fixtures/number-intrinsic.ts";
import { objectFixtures } from "./fixtures/objects.ts";
import { properTailCallFixtures } from "./fixtures/proper-tail-calls.ts";
const { primitiveReceiverSetFixtures } =
  await import("./fixtures/primitive-receiver-inherited-set.ts");
import * as promiseFixtures from "./fixtures/promise-intrinsic.ts";
import { receiverFixtures } from "./fixtures/receivers.ts";
import { regexpIntrinsicFixtures } from "./fixtures/regexp-intrinsic.ts";
import * as setComposition from "./fixtures/set-composition-methods.ts";
import { setIntrinsicFixtures } from "./fixtures/set-intrinsic.ts";
import * as stringFixtures from "./fixtures/string-intrinsic.ts";
import * as typedArrays from "./fixtures/typed-array-constructors.ts";
import * as typedArrayFloat16 from "./fixtures/typed-array-float16.ts";
import * as typedArrayCore from "./fixtures/typed-array-core.ts";
import * as atomics from "./fixtures/atomics-single-agent.ts";
import * as agentFixtures from "./fixtures/atomics-and-shared-memory.ts";
import { blockingAgentFixture } from "./fixtures/non-blocking-agent.ts";
import { crossRealmFixtures } from "./fixtures/cross-realm.ts";
import { weakCollectionFixtures } from "./fixtures/weak-collections.ts";
import * as erasable from "./fixtures/erasable-typescript.ts";
const { typedArrayIterativeFixtures } =
  await import("./fixtures/typed-array-iterative.ts");
const { typedArraySearchAndJoinFixtures } =
  await import("./fixtures/typed-array-search-and-join.ts");
import { symbolIntrinsicFixtures } from "./fixtures/symbol-intrinsic.ts";
const { typedArrayMutationFixtures } =
  await import("./fixtures/typed-array-mutation.ts");
const { typedArraySortFixtures } =
  await import("./fixtures/typed-array-sort.ts");
const { typedArrayStaticsFixtures } =
  await import("./fixtures/typed-array-statics.ts");
const { lexicalStaticFixtures } =
  await import("./fixtures/lexical-static-evidence.ts");
import { lexicalBmpFixtures } from "./fixtures/lexical-bmp-comments.ts";
const { regexpStaticEvidenceFixtures } =
  await import("./fixtures/regexp-static-evidence.ts");
const { regexpLiteralAotFixtures } =
  await import("./fixtures/regexp-literal-aot.ts");
const { regexpAnchoredRepeatFixtures } =
  await import("./fixtures/regexp-anchored-repeat.ts");
const { regexpPrototypeAndExecFixtures } =
  await import("./fixtures/regexp-prototype-and-exec.ts");
const { regexpPatternExtensionFixtures } =
  await import("./fixtures/regexp-pattern-extensions.ts");
const { arrayConstructorFixtures } =
  await import("./fixtures/array-constructor.ts");
const { arrayPrototypeIterativeFixtures } =
  await import("./fixtures/array-prototype-iterative.ts");
const { arrayPrototypeCopyingFixtures } =
  await import("./fixtures/array-prototype-copying.ts");
const { arrayPrototypeReductionFixtures } =
  await import("./fixtures/array-prototype-reduction.ts");
const { arrayPrototypeIndexSearchFixtures } =
  await import("./fixtures/array-prototype-index-search.ts");
const { arrayPrototypeIteratorFixtures } =
  await import("./fixtures/array-prototype-iterators.ts");
const { arrayPrototypeMutationFixtures } =
  await import("./fixtures/array-prototype-mutation.ts");
const { arrayPrototypeChangeByCopyFixtures } =
  await import("./fixtures/array-prototype-change-by-copy.ts");
const { arrayPrototypePredicateSearchFixtures } =
  await import("./fixtures/array-prototype-predicate-search.ts");
const { arrayPrototypeSortFixtures } =
  await import("./fixtures/array-prototype-sort.ts");
const { arrayPrototypeSpeciesMappingFixtures } =
  await import("./fixtures/array-prototype-species-mapping.ts");
const { objectOwnKeysFixtures } = await import("./fixtures/object-own-keys.ts");
const { stringPrototypeAccessFixtures } =
  await import("./fixtures/string-prototype-access.ts");
const { stringPrototypeSearchAndSliceFixtures } =
  await import("./fixtures/string-prototype-search-and-slice.ts");
const { stringPrototypeCaseFixtures } =
  await import("./fixtures/string-prototype-case.ts");
const { stringPrototypePadFixtures } =
  await import("./fixtures/string-prototype-pad.ts");
const { stringPrototypeMatchAndSplitFixtures } =
  await import("./fixtures/string-prototype-match-and-split.ts");
const { numberPrototypeFixtures } =
  await import("./fixtures/number-prototype.ts");
const { stringPrototypeReplaceFixtures } =
  await import("./fixtures/string-prototype-replace.ts");
const { stringIteratorFixtures } =
  await import("./fixtures/string-iterator.ts");
const { genericStringCoercionFixtures } =
  await import("./fixtures/generic-string-coercion.ts");
const { mathNamespaceFixtures } = await import("./fixtures/math-namespace.ts");
const { uriHandlingFunctionFixtures } =
  await import("./fixtures/uri-handling-functions.ts");
const { annexBEscapeFixtures } = await import("./fixtures/annexb-escape.ts");
const { annexBStringMethodFixtures } =
  await import("./fixtures/annexb-string-methods.ts");
const { annexBDateMethodFixtures } =
  await import("./fixtures/annexb-date-methods.ts");
const { annexBLegacyLiteralFixtures } =
  await import("./fixtures/annexb-legacy-literals.ts");
const { globalNumericFunctionFixtures } =
  await import("./fixtures/global-numeric-functions.ts");
const { reflectNamespaceFixtures } =
  await import("./fixtures/reflect-namespace.ts");
const { proxyExoticObjectFixtures } =
  await import("./fixtures/proxy-exotic-object.ts");
const { jsonParseFixtures } = await import("./fixtures/json-parse.ts");
const { jsonStringifyFixtures } = await import("./fixtures/json-stringify.ts");
const { functionIntrinsicChainFixtures, functionIntrinsicKeyOrderFixtures } =
  await import("./fixtures/function-intrinsic-chains.ts");
const { regexpSymbolMethodsFixtures } =
  await import("./fixtures/regexp-symbol-methods.ts");

/** Fixtures that one module under *tests/native/fixtures/* exports. */
export interface NativeFixtureGroup {
  /** Module filename relative to *tests/native/fixtures/*. */
  readonly module: string;
  readonly fixtures: readonly Fixture[];
}

/**
 * Fixture groups in common-loop order. A module may appear more than once
 * when the loop interleaves its exports with another module's.
 */
export const nativeFixtureGroups: readonly NativeFixtureGroup[] = [
  { module: "dynamic-source-static-core.ts", fixtures: staticCore },
  {
    module: "completion-records.ts",
    fixtures: records.completionRecordFixtures,
  },
  {
    module: "dynamic-source-residual.ts",
    fixtures: residualCompletionFixtures,
  },
  { module: "dynamic-source-residual.ts", fixtures: residualClassFixtures },
  {
    module: "dynamic-source-residual.ts",
    fixtures: [residualValueOracleFixture],
  },
  {
    module: "completion-records.ts",
    fixtures: [records.completionRecordOracleFixture],
  },
  { module: "functions.ts", fixtures: functionFixtures },
  {
    module: "erasable-typescript.ts",
    fixtures: erasable.erasableTypeScriptFixtures,
  },
  { module: "callable-object-evidence.ts", fixtures: callableCases },
  { module: "ds22-boundary-core.ts", fixtures: ds22BoundaryCoreFixtures },
  {
    module: "construction-static-contracts.ts",
    fixtures: [cs.constructionStaticFixture],
  },
  { module: "proper-tail-calls.ts", fixtures: properTailCallFixtures },
  {
    module: "global-object-record.ts",
    fixtures: globalRecord.globalObjectRecordFixtures,
  },
  {
    module: "direct-eval-non-string.ts",
    fixtures: [evalFixture.directEvalNonStringFixture],
  },
  {
    module: "binding-reference-evidence.ts",
    fixtures: bindingReferenceEvidenceFixtures,
  },
  {
    module: "globalthis-binding.ts",
    fixtures: globalThisFixture.globalThisBindingFixtures,
  },
  { module: "objects.ts", fixtures: objectFixtures },
  { module: "object-own-keys.ts", fixtures: objectOwnKeysFixtures },
  { module: "array-buffer.ts", fixtures: arrayBufferFixtures },
  { module: "array-constructor.ts", fixtures: arrayConstructorFixtures },
  {
    module: "array-prototype-copying.ts",
    fixtures: arrayPrototypeCopyingFixtures,
  },
  {
    module: "array-prototype-change-by-copy.ts",
    fixtures: arrayPrototypeChangeByCopyFixtures,
  },
  {
    module: "array-prototype-iterative.ts",
    fixtures: arrayPrototypeIterativeFixtures,
  },
  {
    module: "array-prototype-index-search.ts",
    fixtures: arrayPrototypeIndexSearchFixtures,
  },
  {
    module: "array-prototype-iterators.ts",
    fixtures: arrayPrototypeIteratorFixtures,
  },
  {
    module: "array-prototype-mutation.ts",
    fixtures: arrayPrototypeMutationFixtures,
  },
  {
    module: "array-prototype-predicate-search.ts",
    fixtures: arrayPrototypePredicateSearchFixtures,
  },
  {
    module: "array-prototype-reduction.ts",
    fixtures: arrayPrototypeReductionFixtures,
  },
  { module: "array-prototype-sort.ts", fixtures: arrayPrototypeSortFixtures },
  {
    module: "array-prototype-species-mapping.ts",
    fixtures: arrayPrototypeSpeciesMappingFixtures,
  },
  {
    module: "typed-array-constructors.ts",
    fixtures: typedArrays.typedArrayConstructorFixtures,
  },
  {
    module: "typed-array-float16.ts",
    fixtures: typedArrayFloat16.typedArrayFloat16Fixtures,
  },
  {
    module: "typed-array-core.ts",
    fixtures: typedArrayCore.typedArrayCoreFixtures,
  },
  {
    module: "atomics-single-agent.ts",
    fixtures: atomics.atomicsSingleAgentFixtures,
  },
  {
    module: "atomics-and-shared-memory.ts",
    fixtures: agentFixtures.atomicsAndSharedMemoryFixtures,
  },
  { module: "non-blocking-agent.ts", fixtures: [blockingAgentFixture] },
  { module: "cross-realm.ts", fixtures: crossRealmFixtures },
  { module: "typed-array-iterative.ts", fixtures: typedArrayIterativeFixtures },
  {
    module: "typed-array-search-and-join.ts",
    fixtures: typedArraySearchAndJoinFixtures,
  },
  { module: "typed-array-mutation.ts", fixtures: typedArrayMutationFixtures },
  { module: "typed-array-sort.ts", fixtures: typedArraySortFixtures },
  { module: "typed-array-statics.ts", fixtures: typedArrayStaticsFixtures },
  { module: "classes.ts", fixtures: classFixtures },
  {
    module: "class-private-name-lifetimes.ts",
    fixtures: privateNameLifetimeFixtures,
  },
  { module: "bindings.ts", fixtures: bindingFixtures },
  { module: "bigint.ts", fixtures: bigintFixtures },
  { module: "bigint-intrinsic.ts", fixtures: bigintIntrinsicFixtures },
  {
    module: "boolean-intrinsic.ts",
    fixtures: booleanFixture.booleanIntrinsicFixtures,
  },
  { module: "data-view.ts", fixtures: dataViewFixtures },
  { module: "date-family.ts", fixtures: dateFamilyFixtures },
  { module: "expressions.ts", fixtures: expressionFixtures },
  {
    module: "generic-string-coercion.ts",
    fixtures: genericStringCoercionFixtures,
  },
  { module: "receivers.ts", fixtures: receiverFixtures },
  {
    module: "primitive-receiver-inherited-set.ts",
    fixtures: primitiveReceiverSetFixtures,
  },
  { module: "regexp-intrinsic.ts", fixtures: regexpIntrinsicFixtures },
  { module: "regexp-literal-aot.ts", fixtures: regexpLiteralAotFixtures },
  { module: "lexical-static-evidence.ts", fixtures: lexicalStaticFixtures },
  { module: "lexical-bmp-comments.ts", fixtures: lexicalBmpFixtures },
  {
    module: "regexp-static-evidence.ts",
    fixtures: regexpStaticEvidenceFixtures,
  },
  {
    module: "regexp-pattern-extensions.ts",
    fixtures: regexpPatternExtensionFixtures,
  },
  {
    module: "regexp-prototype-and-exec.ts",
    fixtures: regexpPrototypeAndExecFixtures,
  },
  {
    module: "regexp-anchored-repeat.ts",
    fixtures: regexpAnchoredRepeatFixtures,
  },
  { module: "regexp-symbol-methods.ts", fixtures: regexpSymbolMethodsFixtures },
  { module: "generators.ts", fixtures: generatorFixtures },
  {
    module: "function-intrinsic-chains.ts",
    fixtures: functionIntrinsicChainFixtures,
  },
  {
    module: "function-intrinsic-chains.ts",
    fixtures: functionIntrinsicKeyOrderFixtures,
  },
  {
    module: "iterator-intrinsic.ts",
    fixtures: iteratorFixtures.iteratorIntrinsicFixtures,
  },
  {
    module: "iterator-helpers-eager.ts",
    fixtures: eagerHelpers.iteratorHelpersEagerFixtures,
  },
  {
    module: "iterator-helpers-lazy.ts",
    fixtures: lazyHelpers.iteratorHelpersLazyFixtures,
  },
  { module: "map-intrinsic.ts", fixtures: mapFixtures.mapIntrinsicFixtures },
  {
    module: "number-intrinsic.ts",
    fixtures: numberFixtures.numberIntrinsicFixtures,
  },
  {
    module: "promise-intrinsic.ts",
    fixtures: promiseFixtures.promiseIntrinsicFixtures,
  },
  {
    module: "string-intrinsic.ts",
    fixtures: stringFixtures.stringIntrinsicFixtures,
  },
  { module: "symbol-intrinsic.ts", fixtures: symbolIntrinsicFixtures },
  {
    module: "string-prototype-access.ts",
    fixtures: stringPrototypeAccessFixtures,
  },
  {
    module: "string-prototype-search-and-slice.ts",
    fixtures: stringPrototypeSearchAndSliceFixtures,
  },
  { module: "string-prototype-case.ts", fixtures: stringPrototypeCaseFixtures },
  { module: "string-prototype-pad.ts", fixtures: stringPrototypePadFixtures },
  {
    module: "string-prototype-match-and-split.ts",
    fixtures: stringPrototypeMatchAndSplitFixtures,
  },
  {
    module: "string-prototype-replace.ts",
    fixtures: stringPrototypeReplaceFixtures,
  },
  { module: "string-iterator.ts", fixtures: stringIteratorFixtures },
  { module: "number-prototype.ts", fixtures: numberPrototypeFixtures },
  { module: "math-namespace.ts", fixtures: mathNamespaceFixtures },
  {
    module: "uri-handling-functions.ts",
    fixtures: uriHandlingFunctionFixtures,
  },
  { module: "annexb-escape.ts", fixtures: annexBEscapeFixtures },
  {
    module: "annexb-string-methods.ts",
    fixtures: annexBStringMethodFixtures,
  },
  {
    module: "annexb-date-methods.ts",
    fixtures: annexBDateMethodFixtures,
  },
  {
    module: "annexb-legacy-literals.ts",
    fixtures: annexBLegacyLiteralFixtures,
  },
  {
    module: "global-numeric-functions.ts",
    fixtures: globalNumericFunctionFixtures,
  },
  { module: "reflect-namespace.ts", fixtures: reflectNamespaceFixtures },
  { module: "proxy-exotic-object.ts", fixtures: proxyExoticObjectFixtures },
  { module: "json-parse.ts", fixtures: jsonParseFixtures },
  { module: "set-intrinsic.ts", fixtures: setIntrinsicFixtures },
  {
    module: "set-composition-methods.ts",
    fixtures: setComposition.setCompositionMethodFixtures,
  },
  { module: "weak-collections.ts", fixtures: weakCollectionFixtures },
  { module: "json-stringify.ts", fixtures: jsonStringifyFixtures },
  { module: "async.ts", fixtures: asyncFixtures },
  { module: "async-iteration.ts", fixtures: asyncIterationFixtures },
  { module: "async-generators.ts", fixtures: asyncGeneratorFixtures },
];

/** Every fixture the common differential native loop builds and runs. */
export const nativeFixtures: readonly Fixture[] = nativeFixtureGroups.flatMap(
  (group) => group.fixtures,
);
