/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream table of well-known intrinsic objects, unchanged in every
// name and source string. The repository formatter owns every JavaScript
// file here, so spacing differs from upstream.
//
// Upstream obtains each value by passing "return " + source to the Function
// constructor, which ADR 0016 keeps outside this profile. This copy instead
// gives every entry a statically compiled lookup whose returned expression is
// that entry's source, evaluated in the same order with the same abrupt
// completions ignored. An empty source yields undefined, as upstream's
// "return " body does.
//
// One source differs. Upstream's bare eval resolves in the global
// environment, and the profile does not resolve a bare eval identifier.
// Without a global lexical eval declaration, which the Script must be
// non-strict to contain, that resolution is the object record of the global
// object: HasProperty, a ReferenceError when absent, then Get. The %eval%
// lookup performs those steps on the Script's top-level this, which is that
// object whatever the Script's strictness and whatever the globalThis
// binding holds. A Script that declares a top-level let or const named eval
// is the one case it does not reproduce. A Module, whose top-level this is
// undefined, would leave %eval% undefined. No consumer of this include at
// the pinned upstream revision is either.
//
// A missing or throwing lookup leaves the value undefined, and
// getWellKnownIntrinsicObject keeps the upstream lookup, error messages, and
// unknown-name failure.
// Copyright (C) 2018 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

const WellKnownIntrinsicObjects = [
  {
    name: "%AggregateError%",
    source: "AggregateError",
  },
  {
    name: "%Array%",
    source: "Array",
  },
  {
    name: "%ArrayBuffer%",
    source: "ArrayBuffer",
  },
  {
    name: "%ArrayIteratorPrototype%",
    source: "Object.getPrototypeOf([][Symbol.iterator]())",
  },
  {
    // Not currently accessible to ECMAScript user code
    name: "%AsyncFromSyncIteratorPrototype%",
    source: "",
  },
  {
    name: "%AsyncFunction%",
    source: "(async function() {}).constructor",
  },
  {
    name: "%AsyncGeneratorFunction%",
    source: "(async function* () {}).constructor",
  },
  {
    name: "%AsyncGeneratorPrototype%",
    source: "Object.getPrototypeOf(async function* () {}).prototype",
  },
  {
    name: "%AsyncIteratorPrototype%",
    source:
      "Object.getPrototypeOf(Object.getPrototypeOf(async function* () {}).prototype)",
  },
  {
    name: "%Atomics%",
    source: "Atomics",
  },
  {
    name: "%BigInt%",
    source: "BigInt",
  },
  {
    name: "%BigInt64Array%",
    source: "BigInt64Array",
  },
  {
    name: "%BigUint64Array%",
    source: "BigUint64Array",
  },
  {
    name: "%Boolean%",
    source: "Boolean",
  },
  {
    name: "%DataView%",
    source: "DataView",
  },
  {
    name: "%Date%",
    source: "Date",
  },
  {
    name: "%decodeURI%",
    source: "decodeURI",
  },
  {
    name: "%decodeURIComponent%",
    source: "decodeURIComponent",
  },
  {
    name: "%encodeURI%",
    source: "encodeURI",
  },
  {
    name: "%encodeURIComponent%",
    source: "encodeURIComponent",
  },
  {
    name: "%Error%",
    source: "Error",
  },
  {
    name: "%eval%",
    source: "eval",
  },
  {
    name: "%EvalError%",
    source: "EvalError",
  },
  {
    name: "%FinalizationRegistry%",
    source: "FinalizationRegistry",
  },
  {
    name: "%Float32Array%",
    source: "Float32Array",
  },
  {
    name: "%Float64Array%",
    source: "Float64Array",
  },
  {
    // Not currently accessible to ECMAScript user code
    name: "%ForInIteratorPrototype%",
    source: "",
  },
  {
    name: "%Function%",
    source: "Function",
  },
  {
    name: "%GeneratorFunction%",
    source: "(function* () {}).constructor",
  },
  {
    name: "%GeneratorPrototype%",
    source: "Object.getPrototypeOf(function * () {}).prototype",
  },
  {
    name: "%Int8Array%",
    source: "Int8Array",
  },
  {
    name: "%Int16Array%",
    source: "Int16Array",
  },
  {
    name: "%Int32Array%",
    source: "Int32Array",
  },
  {
    name: "%isFinite%",
    source: "isFinite",
  },
  {
    name: "%isNaN%",
    source: "isNaN",
  },
  {
    name: "%Iterator%",
    source:
      'typeof Iterator !== "undefined" ? Iterator : Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())).constructor',
  },
  {
    name: "%IteratorHelperPrototype%",
    source: "Object.getPrototypeOf(Iterator.from([]).drop(0))",
  },
  {
    name: "%JSON%",
    source: "JSON",
  },
  {
    name: "%Map%",
    source: "Map",
  },
  {
    name: "%MapIteratorPrototype%",
    source: "Object.getPrototypeOf(new Map()[Symbol.iterator]())",
  },
  {
    name: "%Math%",
    source: "Math",
  },
  {
    name: "%Number%",
    source: "Number",
  },
  {
    name: "%Object%",
    source: "Object",
  },
  {
    name: "%parseFloat%",
    source: "parseFloat",
  },
  {
    name: "%parseInt%",
    source: "parseInt",
  },
  {
    name: "%Promise%",
    source: "Promise",
  },
  {
    name: "%Proxy%",
    source: "Proxy",
  },
  {
    name: "%RangeError%",
    source: "RangeError",
  },
  {
    name: "%ReferenceError%",
    source: "ReferenceError",
  },
  {
    name: "%Reflect%",
    source: "Reflect",
  },
  {
    name: "%RegExp%",
    source: "RegExp",
  },
  {
    name: "%RegExpStringIteratorPrototype%",
    source: 'Object.getPrototypeOf(RegExp.prototype[Symbol.matchAll](""))',
  },
  {
    name: "%Set%",
    source: "Set",
  },
  {
    name: "%SetIteratorPrototype%",
    source: "Object.getPrototypeOf(new Set()[Symbol.iterator]())",
  },
  {
    name: "%SharedArrayBuffer%",
    source: "SharedArrayBuffer",
  },
  {
    name: "%String%",
    source: "String",
  },
  {
    name: "%StringIteratorPrototype%",
    source: "Object.getPrototypeOf(new String()[Symbol.iterator]())",
  },
  {
    name: "%Symbol%",
    source: "Symbol",
  },
  {
    name: "%SyntaxError%",
    source: "SyntaxError",
  },
  {
    name: "%ThrowTypeError%",
    source:
      '(function() { "use strict"; return Object.getOwnPropertyDescriptor(arguments, "callee").get })()',
  },
  {
    name: "%TypedArray%",
    source: "Object.getPrototypeOf(Uint8Array)",
  },
  {
    name: "%TypeError%",
    source: "TypeError",
  },
  {
    name: "%Uint8Array%",
    source: "Uint8Array",
  },
  {
    name: "%Uint8ClampedArray%",
    source: "Uint8ClampedArray",
  },
  {
    name: "%Uint16Array%",
    source: "Uint16Array",
  },
  {
    name: "%Uint32Array%",
    source: "Uint32Array",
  },
  {
    name: "%URIError%",
    source: "URIError",
  },
  {
    name: "%WeakMap%",
    source: "WeakMap",
  },
  {
    name: "%WeakRef%",
    source: "WeakRef",
  },
  {
    name: "%WeakSet%",
    source: "WeakSet",
  },
  {
    name: "%WrapForValidIteratorPrototype%",
    source:
      "Object.getPrototypeOf(Iterator.from({ [Symbol.iterator](){ return {}; } }))",
  },

  // Extensions to well-known intrinsic objects.
  //
  // https://tc39.es/ecma262/#sec-additional-properties-of-the-global-object
  {
    name: "%escape%",
    source: "escape",
  },
  {
    name: "%unescape%",
    source: "unescape",
  },

  // Extensions to well-known intrinsic objects.
  //
  // https://tc39.es/ecma402/#sec-402-well-known-intrinsic-objects
  {
    name: "%Intl%",
    source: "Intl",
  },
  {
    name: "%Intl.Collator%",
    source: "Intl.Collator",
  },
  {
    name: "%Intl.DateTimeFormat%",
    source: "Intl.DateTimeFormat",
  },
  {
    name: "%Intl.DisplayNames%",
    source: "Intl.DisplayNames",
  },
  {
    name: "%Intl.DurationFormat%",
    source: "Intl.DurationFormat",
  },
  {
    name: "%Intl.ListFormat%",
    source: "Intl.ListFormat",
  },
  {
    name: "%Intl.Locale%",
    source: "Intl.Locale",
  },
  {
    name: "%Intl.NumberFormat%",
    source: "Intl.NumberFormat",
  },
  {
    name: "%Intl.PluralRules%",
    source: "Intl.PluralRules",
  },
  {
    name: "%Intl.RelativeTimeFormat%",
    source: "Intl.RelativeTimeFormat",
  },
  {
    name: "%Intl.Segmenter%",
    source: "Intl.Segmenter",
  },
  {
    name: "%IntlSegmentIteratorPrototype%",
    source:
      "Object.getPrototypeOf(new Intl.Segmenter().segment()[Symbol.iterator]())",
  },
  {
    name: "%IntlSegmentsPrototype%",
    source: "Object.getPrototypeOf(new Intl.Segmenter().segment())",
  },

  // Extensions to well-known intrinsic objects.
  //
  // https://tc39.es/proposal-temporal/#sec-well-known-intrinsic-objects
  {
    name: "%Temporal%",
    source: "Temporal",
  },
];

(function (global) {
  var lookups = {
    "%AggregateError%": function () {
      return AggregateError;
    },
    "%Array%": function () {
      return Array;
    },
    "%ArrayBuffer%": function () {
      return ArrayBuffer;
    },
    "%ArrayIteratorPrototype%": function () {
      return Object.getPrototypeOf([][Symbol.iterator]());
    },
    "%AsyncFromSyncIteratorPrototype%": function () {},
    "%AsyncFunction%": function () {
      return async function () {}.constructor;
    },
    "%AsyncGeneratorFunction%": function () {
      return async function* () {}.constructor;
    },
    "%AsyncGeneratorPrototype%": function () {
      return Object.getPrototypeOf(async function* () {}).prototype;
    },
    "%AsyncIteratorPrototype%": function () {
      return Object.getPrototypeOf(
        Object.getPrototypeOf(async function* () {}).prototype,
      );
    },
    "%Atomics%": function () {
      return Atomics;
    },
    "%BigInt%": function () {
      return BigInt;
    },
    "%BigInt64Array%": function () {
      return BigInt64Array;
    },
    "%BigUint64Array%": function () {
      return BigUint64Array;
    },
    "%Boolean%": function () {
      return Boolean;
    },
    "%DataView%": function () {
      return DataView;
    },
    "%Date%": function () {
      return Date;
    },
    "%decodeURI%": function () {
      return decodeURI;
    },
    "%decodeURIComponent%": function () {
      return decodeURIComponent;
    },
    "%encodeURI%": function () {
      return encodeURI;
    },
    "%encodeURIComponent%": function () {
      return encodeURIComponent;
    },
    "%Error%": function () {
      return Error;
    },
    "%eval%": function () {
      if (!("eval" in global)) throw new ReferenceError("eval is not defined");
      return global.eval;
    },
    "%EvalError%": function () {
      return EvalError;
    },
    "%FinalizationRegistry%": function () {
      return FinalizationRegistry;
    },
    "%Float32Array%": function () {
      return Float32Array;
    },
    "%Float64Array%": function () {
      return Float64Array;
    },
    "%ForInIteratorPrototype%": function () {},
    "%Function%": function () {
      return Function;
    },
    "%GeneratorFunction%": function () {
      return function* () {}.constructor;
    },
    "%GeneratorPrototype%": function () {
      return Object.getPrototypeOf(function* () {}).prototype;
    },
    "%Int8Array%": function () {
      return Int8Array;
    },
    "%Int16Array%": function () {
      return Int16Array;
    },
    "%Int32Array%": function () {
      return Int32Array;
    },
    "%isFinite%": function () {
      return isFinite;
    },
    "%isNaN%": function () {
      return isNaN;
    },
    "%Iterator%": function () {
      return typeof Iterator !== "undefined"
        ? Iterator
        : Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
            .constructor;
    },
    "%IteratorHelperPrototype%": function () {
      return Object.getPrototypeOf(Iterator.from([]).drop(0));
    },
    "%JSON%": function () {
      return JSON;
    },
    "%Map%": function () {
      return Map;
    },
    "%MapIteratorPrototype%": function () {
      return Object.getPrototypeOf(new Map()[Symbol.iterator]());
    },
    "%Math%": function () {
      return Math;
    },
    "%Number%": function () {
      return Number;
    },
    "%Object%": function () {
      return Object;
    },
    "%parseFloat%": function () {
      return parseFloat;
    },
    "%parseInt%": function () {
      return parseInt;
    },
    "%Promise%": function () {
      return Promise;
    },
    "%Proxy%": function () {
      return Proxy;
    },
    "%RangeError%": function () {
      return RangeError;
    },
    "%ReferenceError%": function () {
      return ReferenceError;
    },
    "%Reflect%": function () {
      return Reflect;
    },
    "%RegExp%": function () {
      return RegExp;
    },
    "%RegExpStringIteratorPrototype%": function () {
      return Object.getPrototypeOf(RegExp.prototype[Symbol.matchAll](""));
    },
    "%Set%": function () {
      return Set;
    },
    "%SetIteratorPrototype%": function () {
      return Object.getPrototypeOf(new Set()[Symbol.iterator]());
    },
    "%SharedArrayBuffer%": function () {
      return SharedArrayBuffer;
    },
    "%String%": function () {
      return String;
    },
    "%StringIteratorPrototype%": function () {
      return Object.getPrototypeOf(new String()[Symbol.iterator]());
    },
    "%Symbol%": function () {
      return Symbol;
    },
    "%SyntaxError%": function () {
      return SyntaxError;
    },
    "%ThrowTypeError%": function () {
      return (function () {
        "use strict";
        return Object.getOwnPropertyDescriptor(arguments, "callee").get;
      })();
    },
    "%TypedArray%": function () {
      return Object.getPrototypeOf(Uint8Array);
    },
    "%TypeError%": function () {
      return TypeError;
    },
    "%Uint8Array%": function () {
      return Uint8Array;
    },
    "%Uint8ClampedArray%": function () {
      return Uint8ClampedArray;
    },
    "%Uint16Array%": function () {
      return Uint16Array;
    },
    "%Uint32Array%": function () {
      return Uint32Array;
    },
    "%URIError%": function () {
      return URIError;
    },
    "%WeakMap%": function () {
      return WeakMap;
    },
    "%WeakRef%": function () {
      return WeakRef;
    },
    "%WeakSet%": function () {
      return WeakSet;
    },
    "%WrapForValidIteratorPrototype%": function () {
      return Object.getPrototypeOf(
        Iterator.from({
          [Symbol.iterator]() {
            return {};
          },
        }),
      );
    },
    "%escape%": function () {
      return escape;
    },
    "%unescape%": function () {
      return unescape;
    },
    "%Intl%": function () {
      return Intl;
    },
    "%Intl.Collator%": function () {
      return Intl.Collator;
    },
    "%Intl.DateTimeFormat%": function () {
      return Intl.DateTimeFormat;
    },
    "%Intl.DisplayNames%": function () {
      return Intl.DisplayNames;
    },
    "%Intl.DurationFormat%": function () {
      return Intl.DurationFormat;
    },
    "%Intl.ListFormat%": function () {
      return Intl.ListFormat;
    },
    "%Intl.Locale%": function () {
      return Intl.Locale;
    },
    "%Intl.NumberFormat%": function () {
      return Intl.NumberFormat;
    },
    "%Intl.PluralRules%": function () {
      return Intl.PluralRules;
    },
    "%Intl.RelativeTimeFormat%": function () {
      return Intl.RelativeTimeFormat;
    },
    "%Intl.Segmenter%": function () {
      return Intl.Segmenter;
    },
    "%IntlSegmentIteratorPrototype%": function () {
      return Object.getPrototypeOf(
        new Intl.Segmenter().segment()[Symbol.iterator](),
      );
    },
    "%IntlSegmentsPrototype%": function () {
      return Object.getPrototypeOf(new Intl.Segmenter().segment());
    },
    "%Temporal%": function () {
      return Temporal;
    },
  };
  WellKnownIntrinsicObjects.forEach(function (wkio) {
    var actual;

    try {
      actual = lookups[wkio.name]();
    } catch (exception) {
      // Nothing to do here.
    }

    wkio.value = actual;
  });
})(this);

/**
 * Returns a well-known intrinsic object, if the implementation provides it.
 * Otherwise, throws.
 * @param {string} key - the specification's name for the intrinsic, for example
 *   "%Array%"
 * @returns {object} the well-known intrinsic object.
 */
function getWellKnownIntrinsicObject(key) {
  for (var ix = 0; ix < WellKnownIntrinsicObjects.length; ix++) {
    if (WellKnownIntrinsicObjects[ix].name === key) {
      var value = WellKnownIntrinsicObjects[ix].value;
      if (value !== undefined) return value;
      throw new Test262Error("this implementation could not obtain " + key);
    }
  }
  throw new Test262Error("unknown well-known intrinsic " + key);
}
