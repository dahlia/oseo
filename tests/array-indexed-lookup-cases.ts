/** Source and independent output for one array layout transition sequence. */
interface ArrayIndexedLookupCase {
  readonly source: string;
  readonly stdout: string;
}

/**
 * Keep every layout transition while generated numeric payloads shrink.
 * The existing Array constructor property supplies at most four items.
 */
export function arrayIndexedLookupCase(
  items: readonly number[],
  marker: number,
): ArrayIndexedLookupCase {
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
const indexed = Array.of(${values.join(", ")});
function indexedSum(a, b, c, d, e, f) { return a + b + c + d + e + f; }
console.log("indexed dense", indexed[5], indexedSum.apply(null, indexed));
Object.defineProperty(indexed, "4", { writable: false });
console.log("indexed read-only", Reflect.set(indexed, "4", -1), indexed[4]);
let indexedStored = ${marker};
let indexedGets = 0;
Object.defineProperty(indexed, "2", {
  configurable: true,
  enumerable: false,
  get: function () {
    indexedGets = indexedGets + 1;
    return indexedStored;
  },
  set: function (value) { indexedStored = value; },
});
indexed[2] = ${marker + 6};
const indexedDescriptor = Object.getOwnPropertyDescriptor(indexed, "2");
console.log(
  "indexed accessor", indexed[2], indexedGets,
  typeof indexedDescriptor.get, typeof indexedDescriptor.set,
  indexedDescriptor.enumerable, indexedDescriptor.configurable,
  Object.keys(indexed).join("|"),
);
delete indexed[0];
console.log("indexed hole", indexed[0], 0 in indexed, indexed[3]);
const indexedPrototype = Object.create(Array.prototype);
Object.defineProperty(indexedPrototype, "0", {
  configurable: true,
  get: function () { return this === indexed ? ${marker + 10} : -1; },
});
Object.setPrototypeOf(indexed, indexedPrototype);
console.log(
  "indexed inherited", indexed[0], 0 in indexed,
  Object.getOwnPropertyDescriptor(indexed, "0") === undefined,
);
Object.defineProperty(indexed, "0", {
  configurable: true, enumerable: true, value: ${marker + 11}, writable: true,
});
Object.defineProperty(indexed, "2", {
  configurable: false, enumerable: true, value: ${marker + 20}, writable: false,
});
let indexedWriteRejected = false;
try {
  (function () { "use strict"; indexed[2] = -1; })();
} catch (error) { indexedWriteRejected = error instanceof TypeError; }
console.log(
  "indexed reinsert", indexed[0], indexed[2], indexedWriteRejected,
  Reflect.deleteProperty(indexed, "2"), Object.keys(indexed).join("|"),
);
console.log(
  "indexed truncate", Reflect.set(indexed, "length", 1),
  indexed.length, indexed[0], indexed[2], indexed[3],
  Reflect.ownKeys(indexed).join("|"),
);
const indexedMixed = [];
const indexedSymbol = Symbol("0");
indexedMixed.note = ${marker};
indexedMixed[indexedSymbol] = ${marker + 1};
indexedMixed[0] = ${marker + 2};
indexedMixed[1] = ${marker + 3};
indexedMixed["01"] = ${marker + 4};
indexedMixed["-0"] = ${marker + 5};
indexedMixed["1.0"] = ${marker + 6};
indexedMixed["4294967295"] = ${marker + 7};
indexedMixed["4294967294"] = ${marker + 8};
console.log(
  "indexed mixed", indexedMixed[-0], indexedMixed[1],
  indexedMixed["01"], indexedMixed["-0"], indexedMixed["1.0"],
  indexedMixed["4294967295"], indexedMixed["4294967294"],
  indexedMixed[indexedSymbol], indexedMixed.length,
  Object.getOwnPropertySymbols(indexedMixed)[0] === indexedSymbol,
  Object.keys(indexedMixed).join("|"),
);
let indexedProxyReads = 0;
const indexedProxy = new Proxy(indexed, {
  get: function (target, key, receiver) {
    indexedProxyReads = indexedProxyReads + 1;
    return key === "1" ? ${marker + 30} : Reflect.get(target, key, receiver);
  },
});
console.log("indexed proxy", indexedProxy[0], indexedProxy[1],
  indexedProxy[2], indexedProxyReads);
const indexedOrdinary = { note: ${marker}, 1: ${marker + 1}, 0: ${marker + 2} };
console.log("indexed ordinary", indexedOrdinary[0], indexedOrdinary[1]);
const indexedReuse = [${marker}, ${marker + 1}, ${marker + 2}];
indexedReuse.length = 0;
indexedReuse[0] = { value: ${marker + 3} };
indexedReuse[1] = { value: ${marker + 4} };
console.log("indexed reuse", indexedReuse.length,
  indexedReuse[0].value, indexedReuse[1].value);
`,
    // These observations follow the specified transitions, without running
    // array operations or the subject source to derive their values.
    stdout: [
      `indexed dense ${marker + 5} ` +
        values.reduce((sum, value) => sum + value, 0),
      `indexed read-only false ${values[4]}`,
      `indexed accessor ${marker + 6} 1 function function false true ` +
        "0|1|3|4|5",
      `indexed hole undefined false ${values[3]}`,
      `indexed inherited ${marker + 10} true true`,
      `indexed reinsert ${marker + 11} ${marker + 20} true false ` +
        "0|1|2|3|4|5",
      `indexed truncate false 3 ${marker + 11} ${marker + 20} ` +
        "undefined 0|1|2|length",
      "indexed mixed " +
        [2, 3, 4, 5, 6, 7, 8, 1].map((n) => marker + n).join(" ") +
        " 4294967295 true 0|1|4294967294|note|01|-0|1.0|4294967295",
      `indexed proxy ${marker + 11} ${marker + 30} ${marker + 20} 3`,
      `indexed ordinary ${marker + 2} ${marker + 1}`,
      `indexed reuse 2 ${marker + 3} ${marker + 4}`,
      "",
    ].join("\n"),
  };
}
