/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// A reviewed subset of the upstream Temporal test helpers. Outside the
// Temporal and Intl directories, the pinned suite includes this harness
// only for its generic observers: the reviewed Iterator.from cases call
// TemporalHelpers.propertyBagObserver and TemporalHelpers.observeMethod.
// This copy keeps those two helpers, the toPrimitiveObserver helper that
// propertyBagObserver returns for primitive property values, and the
// upstream formatPropertyName function and ASCII_IDENTIFIER pattern they
// log through. Each kept operation is unchanged; the repository formatter
// owns every JavaScript file here, so spacing differs from upstream.
//
// Every other TemporalHelpers member is omitted. Most construct, compare,
// or assert on Temporal or Intl values, and admitting this file must not
// admit either. The reviewed runner compares this object's members with
// the upstream object's and runs a case with TemporalHelpers behind a
// trap, so any observation of an omitted member makes the case a harness
// failure instead of an outcome of this copy. Upstream's
// SKIP_SYMBOL serves only the omitted substituteMethod and SUBSTITUTE_SKIP
// members and is not reproduced.

// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: |
    This defines helper objects and functions for testing Temporal.
defines: [TemporalHelpers]
features: [Symbol.species, Symbol.iterator, Temporal]
---*/

const ASCII_IDENTIFIER = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/u;

function formatPropertyName(propertyKey, objectName = "") {
  switch (typeof propertyKey) {
    case "symbol":
      if (Symbol.keyFor(propertyKey) !== undefined) {
        return `${objectName}[Symbol.for('${Symbol.keyFor(propertyKey)}')]`;
      } else if (propertyKey.description.startsWith("Symbol.")) {
        return `${objectName}[${propertyKey.description}]`;
      } else {
        return `${objectName}[Symbol('${propertyKey.description}')]`;
      }
    case "string":
      if (propertyKey !== String(Number(propertyKey))) {
        if (ASCII_IDENTIFIER.test(propertyKey)) {
          return objectName ? `${objectName}.${propertyKey}` : propertyKey;
        }
        return `${objectName}['${propertyKey.replace(/'/g, "\\'")}']`;
      }
    // fall through
    default:
      // integer or string integer-index
      return `${objectName}[${propertyKey}]`;
  }
}

var TemporalHelpers = {
  /*
   * observeMethod(calls, object, propertyName, value):
   *
   * Defines an own property @object.@propertyName with value @value, that
   * will log any calls of @value to the array @calls.
   */
  observeMethod(calls, object, propertyName, objectName = "") {
    const method = object[propertyName];
    object[propertyName] = function () {
      calls.push(`call ${formatPropertyName(propertyName, objectName)}`);
      return method.apply(object, arguments);
    };
  },

  /*
   * propertyBagObserver():
   * Returns an object that behaves like the given propertyBag but tracks Get
   * and Has operations on any of its properties, by appending messages to an
   * array. If the value of a property in propertyBag is a primitive, the value
   * of the returned object's property will additionally be a
   * TemporalHelpers.toPrimitiveObserver that will track calls to its toString
   * and valueOf methods in the same array. This is for the purpose of testing
   * order of operations that are observable from user code. objectName is used
   * in the log.
   * If skipToPrimitive is given, it must be an array of property keys. Those
   * properties will not have a TemporalHelpers.toPrimitiveObserver returned,
   * and instead just be returned directly.
   */
  propertyBagObserver(calls, propertyBag, objectName, skipToPrimitive) {
    return new Proxy(propertyBag, {
      ownKeys(target) {
        calls.push(`ownKeys ${objectName}`);
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        calls.push(
          `getOwnPropertyDescriptor ${formatPropertyName(key, objectName)}`,
        );
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get(target, key, receiver) {
        calls.push(`get ${formatPropertyName(key, objectName)}`);
        const result = Reflect.get(target, key, receiver);
        if (result === undefined) {
          return undefined;
        }
        if (
          (result !== null && typeof result === "object") ||
          typeof result === "function"
        ) {
          return result;
        }
        if (skipToPrimitive && skipToPrimitive.indexOf(key) >= 0) {
          return result;
        }
        return TemporalHelpers.toPrimitiveObserver(
          calls,
          result,
          `${formatPropertyName(key, objectName)}`,
        );
      },
      has(target, key) {
        calls.push(`has ${formatPropertyName(key, objectName)}`);
        return Reflect.has(target, key);
      },
    });
  },

  /*
   * Returns an object that will append logs of any Gets or Calls of its valueOf
   * or toString properties to the array calls. Both valueOf and toString will
   * return the actual primitiveValue. propertyName is used in the log.
   */
  toPrimitiveObserver(calls, primitiveValue, propertyName) {
    return {
      get valueOf() {
        calls.push(`get ${propertyName}.valueOf`);
        return function () {
          calls.push(`call ${propertyName}.valueOf`);
          return primitiveValue;
        };
      },
      get toString() {
        calls.push(`get ${propertyName}.toString`);
        return function () {
          calls.push(`call ${propertyName}.toString`);
          if (primitiveValue === undefined) return undefined;
          return primitiveValue.toString();
        };
      },
    };
  },
};
