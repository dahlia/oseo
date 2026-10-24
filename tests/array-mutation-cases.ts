/** Source and independent observations for bounded array mutation cases. */
interface ArrayInsertionTruncationCase {
  readonly source: string;
  readonly stdout: string;
}

/** Keep every guard transition while the existing numeric payloads shrink. */
export function arrayInsertionTruncationCase(
  items: readonly number[],
  marker: number,
): ArrayInsertionTruncationCase {
  const values = [
    marker,
    items[0] ?? marker + 1,
    items[1] ?? marker + 2,
    items[2] ?? marker + 3,
    items[3] ?? marker + 4,
    marker + 5,
  ];
  return {
    source: `
const insertionPayload = [${values.join(", ")}];
const insertionDense = [];
for (let insertionIndex = 0; insertionIndex < 6; insertionIndex++) {
  insertionDense[insertionIndex] = { value: insertionPayload[insertionIndex] };
}
function insertionSum(a, b, c, d, e, f) {
  return a.value + b.value + c.value + d.value + e.value + f.value;
}
console.log("insertion dense", insertionDense.length,
  insertionSum.apply(null, insertionDense));
insertionDense.length = 2;
console.log("insertion trim", insertionDense.length, insertionDense[1].value,
  2 in insertionDense, Object.keys(insertionDense).join("|"));
insertionDense.length = 6;
insertionDense.length = 4;
console.log("insertion trailing holes", insertionDense.length,
  insertionDense[1].value, 2 in insertionDense, 3 in insertionDense);
insertionDense.length = 0;
insertionDense[0] = { value: ${marker + 10} };
insertionDense[1] = { value: ${marker + 11} };
console.log("insertion reuse", insertionDense.length,
  insertionDense[0].value, insertionDense[1].value);

const insertionDefined = [];
Object.defineProperty(insertionDefined, "0", {
  configurable: true, enumerable: true, value: ${marker}, writable: false,
});
Object.defineProperty(insertionDefined, "3", {
  configurable: true, enumerable: true, value: ${marker + 3}, writable: true,
});
console.log("insertion define", insertionDefined.length,
  Reflect.set(insertionDefined, "0", -1), insertionDefined[0],
  Object.keys(insertionDefined).join("|"));
insertionDefined.length = 1;
console.log("insertion define trim", insertionDefined.length,
  insertionDefined[0], 3 in insertionDefined);

const insertionHoles = Array(6);
insertionHoles[4] = ${marker + 4};
insertionHoles[0] = ${marker};
insertionHoles[2] = ${marker + 2};
delete insertionHoles[0];
insertionHoles[0] = ${marker + 6};
insertionHoles.length = 3;
console.log("insertion holes", insertionHoles.length, insertionHoles[0],
  insertionHoles[2], 1 in insertionHoles, 4 in insertionHoles,
  Object.keys(insertionHoles).join("|"));

const insertionMixed = [];
const insertionSymbol = Symbol("insertion");
insertionMixed.note = ${marker};
insertionMixed[insertionSymbol] = ${marker + 1};
insertionMixed[0] = ${marker + 2};
insertionMixed[1] = ${marker + 3};
insertionMixed["01"] = ${marker + 4};
insertionMixed.length = 0;
console.log("insertion mixed", insertionMixed.length, insertionMixed.note,
  insertionMixed[insertionSymbol], insertionMixed["01"],
  Object.keys(insertionMixed).join("|"),
  Object.getOwnPropertySymbols(insertionMixed)[0] === insertionSymbol);
const insertionSymbolFirst = [];
insertionSymbolFirst[insertionSymbol] = ${marker};
insertionSymbolFirst[0] = ${marker + 1};
insertionSymbolFirst[5] = ${marker + 5};
insertionSymbolFirst.length = 1;
console.log("insertion symbol first", insertionSymbolFirst.length,
  insertionSymbolFirst[0], insertionSymbolFirst[insertionSymbol],
  5 in insertionSymbolFirst);

const insertionAccessor = [${marker}, ${marker + 1}, ${marker + 2}];
let insertionGets = 0;
let insertionStored = ${marker};
Object.defineProperty(insertionAccessor, "1", {
  configurable: true,
  get: function () { insertionGets++; return insertionStored; },
  set: function (value) { insertionStored = value; },
});
insertionAccessor[1] = ${marker + 7};
const insertionRead = insertionAccessor[1];
insertionAccessor.length = 0;
console.log("insertion accessor", insertionAccessor.length,
  insertionRead, insertionStored, insertionGets);

const insertionPrototype = Object.create(Array.prototype);
let insertionSetValue = 0;
Object.defineProperty(insertionPrototype, "0", {
  configurable: true,
  set: function (value) { insertionSetValue = value; this.note = value; },
});
Object.defineProperty(insertionPrototype, "2", { value: ${marker + 2} });
Object.defineProperty(insertionPrototype, "3", {
  configurable: true, value: ${marker + 3}, writable: true,
});
const insertionInherited = [];
Object.setPrototypeOf(insertionInherited, insertionPrototype);
insertionInherited[0] = ${marker + 8};
console.log("insertion setter", insertionInherited.length, insertionSetValue,
  insertionInherited.note, Object.hasOwn(insertionInherited, "0"),
  Reflect.set(insertionInherited, "2", -1));
Object.defineProperty(insertionInherited, "0", {
  configurable: true, value: ${marker + 9}, writable: true,
});
insertionInherited[3] = ${marker + 10};
insertionInherited.length = 0;
console.log("insertion inherited trim", insertionInherited.length,
  Object.hasOwn(insertionInherited, "3"), insertionInherited[3],
  insertionInherited.note);

const insertionBarrier = [0, 1, 2, 3, 4, 5];
Object.defineProperty(insertionBarrier, "2", { configurable: false });
console.log("insertion barrier", Reflect.set(insertionBarrier, "length", 1),
  insertionBarrier.length, 2 in insertionBarrier, 3 in insertionBarrier,
  Object.keys(insertionBarrier).join("|"));
console.log("insertion locked rollback",
  Reflect.defineProperty(insertionBarrier, "length", {
    value: 0, writable: false,
  }), insertionBarrier.length,
  Object.getOwnPropertyDescriptor(insertionBarrier, "length").writable,
  Reflect.set(insertionBarrier, "3", 30));

const insertionUnordered = [];
Object.defineProperty(insertionUnordered, "4", { value: 4 });
insertionUnordered[8] = 8;
Object.defineProperty(insertionUnordered, "2", { value: 2 });
insertionUnordered[6] = 6;
insertionUnordered[10] = 10;
let insertionStrictFailure = false;
try {
  (function () { "use strict"; insertionUnordered.length = 1; })();
} catch (error) { insertionStrictFailure = error instanceof TypeError; }
console.log("insertion descending", insertionStrictFailure,
  insertionUnordered.length, 2 in insertionUnordered, 4 in insertionUnordered,
  6 in insertionUnordered, 8 in insertionUnordered, 10 in insertionUnordered);

const insertionClosed = [${marker}, ${marker + 1}, ${marker + 2}];
Object.preventExtensions(insertionClosed);
insertionClosed.length = 1;
console.log("insertion closed", insertionClosed.length, insertionClosed[0],
  Reflect.set(insertionClosed, "1", -1),
  Reflect.defineProperty(insertionClosed, "2", { value: -1 }));

const insertionReadOnly = [0, 1];
Object.defineProperty(insertionReadOnly, "length", { writable: false });
let insertionConversions = 0;
const insertionLength = { valueOf: function () {
  insertionConversions++; return 2;
} };
const insertionSetLength = Reflect.set(
  insertionReadOnly, "length", insertionLength,
);
const insertionBeforeDefine = insertionConversions;
const insertionDefineLength = Reflect.defineProperty(
  insertionReadOnly, "length", { value: insertionLength },
);
console.log("insertion readonly", insertionSetLength, insertionBeforeDefine,
  insertionDefineLength, insertionConversions,
  Reflect.set(insertionReadOnly, "2", -1));

const insertionCoercion = [0, 1, 2];
let insertionCoercions = 0;
insertionCoercion.length = { valueOf: function () {
  insertionCoercions++;
  insertionCoercion.note = ${marker};
  return 1;
} };
let insertionAbrupt = false;
try {
  insertionCoercion.length = { valueOf: function () {
    throw new RangeError("insertion length");
  } };
} catch (error) { insertionAbrupt = error instanceof RangeError; }
console.log("insertion conversion", insertionCoercions,
  insertionCoercion.length, insertionCoercion.note, insertionAbrupt,
  Object.keys(insertionCoercion).join("|"));

const insertionSame = [];
Object.defineProperty(insertionSame, "0", { value: NaN });
Object.defineProperty(insertionSame, "1", { value: -0 });
console.log("insertion same value",
  Reflect.defineProperty(insertionSame, "0", { value: NaN }),
  Reflect.defineProperty(insertionSame, "0", { value: 0 }),
  Reflect.defineProperty(insertionSame, "1", { value: -0 }),
  Reflect.defineProperty(insertionSame, "1", { value: 0 }),
  Reflect.deleteProperty(insertionSame, "1"));

const insertionProxyTarget = [];
let insertionProxySets = 0;
const insertionProxy = new Proxy(insertionProxyTarget, {
  set: function (target, key, value, receiver) {
    insertionProxySets++;
    return Reflect.set(target, key, value, receiver);
  },
});
insertionProxy[0] = ${marker};
insertionProxy[3] = ${marker + 3};
insertionProxy.length = 1;
console.log("insertion proxy", insertionProxySets, insertionProxyTarget.length,
  insertionProxyTarget[0], 3 in insertionProxyTarget);
`,
    // Compute observations from the contract, without running the source
    // or using the array mutation operations that the subject exercises.
    stdout: [
      `insertion dense 6 ${values.reduce((sum, value) => sum + value, 0)}`,
      `insertion trim 2 ${values[1]} false 0|1`,
      `insertion trailing holes 4 ${values[1]} false false`,
      `insertion reuse 2 ${marker + 10} ${marker + 11}`,
      `insertion define 4 false ${marker} 0|3`,
      `insertion define trim 1 ${marker} false`,
      `insertion holes 3 ${marker + 6} ${marker + 2} false false 0|2`,
      `insertion mixed 0 ${marker} ${marker + 1} ${marker + 4} note|01 true`,
      `insertion symbol first 1 ${marker + 1} ${marker} false`,
      `insertion accessor 0 ${marker + 7} ${marker + 7} 1`,
      `insertion setter 0 ${marker + 8} ${marker + 8} false false`,
      `insertion inherited trim 0 false ${marker + 3} ${marker + 8}`,
      "insertion barrier false 3 true false 0|1|2",
      "insertion locked rollback false 3 false false",
      "insertion descending true 5 true true false false false",
      `insertion closed 1 ${marker} false false`,
      "insertion readonly false 0 true 2 false",
      `insertion conversion 2 1 ${marker} true 0|note`,
      "insertion same value true false true false false",
      `insertion proxy 3 1 ${marker} false`,
      "",
    ].join("\n"),
  };
}
