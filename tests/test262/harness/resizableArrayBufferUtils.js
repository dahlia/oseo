/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream resizable-buffer harness, unchanged in behavior except for
// how its three subclasses are created. The repository formatter owns every
// JavaScript file here, so spacing differs from upstream while every other
// operation is identical. Upstream builds MyUint8Array, MyFloat32Array, and
// MyBigInt64Array with a `subClass` helper that compiles
// `return class My<type> extends <type> {}` through the Function
// constructor, which this profile keeps outside the admitted dynamic
// source. That body is evaluated in the global environment and only
// declares a class, so the same class expressions are written here at the
// harness's top level, where each heritage name resolves to the same
// global constructor. Upstream's try/catch returns undefined only on an
// engine without class syntax; this profile admits classes, so the three
// bindings always hold their classes, as upstream's do on such an engine.
// `subClass` is upstream-internal, outside its `defines`, and no reviewed
// case calls it, so it is not reproduced. Both `typeof Float16Array`
// probes are kept, so the constructor lists are exactly the ones upstream
// selects on the host that runs them.

// Copyright 2023 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: |
    Collection of helper constants and functions for testing resizable array buffers.
defines:
  - floatCtors
  - ctors
  - MyBigInt64Array
  - CreateResizableArrayBuffer
  - MayNeedBigInt
  - Convert
  - ToNumbers
  - CreateRabForTest
  - CollectValuesAndResize
  - TestIterationAndResize
features: [BigInt]
---*/

const MyUint8Array = class MyUint8Array extends Uint8Array {};
const MyFloat32Array = class MyFloat32Array extends Float32Array {};
const MyBigInt64Array = class MyBigInt64Array extends BigInt64Array {};

const builtinCtors = [
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray,
];

// Big(U)int64Array and Float16Array are newer features adding them above unconditionally
// would cause implementations lacking it to fail every test which uses it.
if (typeof Float16Array !== "undefined") {
  builtinCtors.push(Float16Array);
}

if (typeof BigUint64Array !== "undefined") {
  builtinCtors.push(BigUint64Array);
}

if (typeof BigInt64Array !== "undefined") {
  builtinCtors.push(BigInt64Array);
}

const floatCtors = [Float32Array, Float64Array, MyFloat32Array];

if (typeof Float16Array !== "undefined") {
  floatCtors.push(Float16Array);
}

const ctors = builtinCtors.concat(MyUint8Array, MyFloat32Array);

if (typeof MyBigInt64Array !== "undefined") {
  ctors.push(MyBigInt64Array);
}

function CreateResizableArrayBuffer(byteLength, maxByteLength) {
  return new ArrayBuffer(byteLength, { maxByteLength: maxByteLength });
}

function Convert(item) {
  if (typeof item == "bigint") {
    return Number(item);
  }
  return item;
}

function ToNumbers(array) {
  let result = [];
  for (let i = 0; i < array.length; i++) {
    let item = array[i];
    result.push(Convert(item));
  }
  return result;
}

function MayNeedBigInt(ta, n) {
  assert.sameValue(typeof n, "number");
  if (
    (BigInt64Array !== "undefined" && ta instanceof BigInt64Array) ||
    (BigUint64Array !== "undefined" && ta instanceof BigUint64Array)
  ) {
    return BigInt(n);
  }
  return n;
}

function CreateRabForTest(ctor) {
  const rab = CreateResizableArrayBuffer(
    4 * ctor.BYTES_PER_ELEMENT,
    8 * ctor.BYTES_PER_ELEMENT,
  );
  // Write some data into the array.
  const taWrite = new ctor(rab);
  for (let i = 0; i < 4; ++i) {
    taWrite[i] = MayNeedBigInt(taWrite, 2 * i);
  }
  return rab;
}

function CollectValuesAndResize(n, values, rab, resizeAfter, resizeTo) {
  if (typeof n == "bigint") {
    values.push(Number(n));
  } else {
    values.push(n);
  }
  if (values.length == resizeAfter) {
    rab.resize(resizeTo);
  }
  return true;
}

function TestIterationAndResize(
  iterable,
  expected,
  rab,
  resizeAfter,
  newByteLength,
) {
  let values = [];
  let resized = false;
  var arrayValues = false;

  for (let value of iterable) {
    if (Array.isArray(value)) {
      arrayValues = true;
      values.push([value[0], Number(value[1])]);
    } else {
      values.push(Number(value));
    }
    if (!resized && values.length == resizeAfter) {
      rab.resize(newByteLength);
      resized = true;
    }
  }
  if (!arrayValues) {
    assert.compareArray(
      [].concat(values),
      expected,
      "TestIterationAndResize: list of iterated values",
    );
  } else {
    for (let i = 0; i < expected.length; i++) {
      assert.compareArray(
        values[i],
        expected[i],
        "TestIterationAndResize: list of iterated lists of values",
      );
    }
  }
  assert(
    resized,
    "TestIterationAndResize: resize condition should have been hit",
  );
}
