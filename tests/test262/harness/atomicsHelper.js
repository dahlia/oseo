/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream agent helpers over the native test262 host's `$262.agent`,
// unchanged in behavior except for one binding. Upstream installs the
// host's global `setTimeout` as `$262.agent.setTimeout`, or a Promise
// polling substitute when the global object has none. This profile's host
// timer is a call target rather than a global object property, so the
// substitute would replace a real timer with a busy loop, and reading the
// timer as a value is outside the admitted profile. The helper therefore
// forwards to the host timer, which every reviewed case only calls. The
// repository formatter owns every JavaScript file here, so spacing and
// comments differ from upstream.
// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
{
  // This is only necessary because the original $262.agent.getReport API
  // was insufficient: it is paved over with one that waits for a report.
  let getReport = $262.agent.getReport.bind($262.agent);

  $262.agent.getReport = function () {
    var r;
    while ((r = getReport()) == null) {
      $262.agent.sleep(1);
    }
    return r;
  };

  $262.agent.setTimeout = function (callback, delay) {
    return setTimeout(callback, delay);
  };

  $262.agent.getReportAsync = function () {
    return new Promise(function (resolve) {
      (function loop() {
        let result = getReport();
        if (!result) {
          setTimeout(loop, 1000);
        } else {
          resolve(result);
        }
      })();
    });
  };
}

/**
 * Share a given Int32Array or BigInt64Array to all running agents. Ensure
 * that the provided TypedArray is a "shared typed array".
 *
 * @param {(Int32Array|BigInt64Array)} typedArray An Int32Array or
 *   BigInt64Array with a SharedArrayBuffer
 */
$262.agent.safeBroadcast = function (typedArray) {
  let Constructor = Object.getPrototypeOf(typedArray).constructor;
  let temp = new Constructor(
    new SharedArrayBuffer(Constructor.BYTES_PER_ELEMENT),
  );
  try {
    // This will never actually wait, but that's fine because we only
    // want to ensure that this typedArray CAN be waited on and is shareable.
    Atomics.wait(temp, 0, Constructor === Int32Array ? 1 : BigInt(1));
  } catch (error) {
    throw new Test262Error(
      `${Constructor.name} cannot be used as a shared typed array. (${error})`,
    );
  }

  $262.agent.broadcast(typedArray.buffer);
};

$262.agent.safeBroadcastAsync = async function (ta, index, expected) {
  await $262.agent.broadcast(ta.buffer);
  await $262.agent.waitUntil(ta, index, expected);
  await $262.agent.tryYield();
  return await Atomics.load(ta, index);
};

/**
 * With a given Int32Array or BigInt64Array, wait until the expected number
 * of agents have reported themselves by calling:
 *
 *    Atomics.add(typedArray, index, 1);
 *
 * @param {(Int32Array|BigInt64Array)} typedArray An Int32Array or
 *   BigInt64Array with a SharedArrayBuffer
 * @param {number} index    The index of which all agents will report.
 * @param {number} expected The number of agents that are expected to report
 *   as active.
 */
$262.agent.waitUntil = function (typedArray, index, expected) {
  var agents = 0;
  while ((agents = Atomics.load(typedArray, index)) !== expected) {
    /* nothing */
  }
  assert.sameValue(
    agents,
    expected,
    "Reporting number of 'agents' equals the value of 'expected'",
  );
};

/**
 * Timeout values used throughout the Atomics tests, in milliseconds.
 *
 * `yield` is used for `$262.agent.tryYield`. `small` is used when agents
 * always time out and notification is not part of the test. `long` is used
 * when some agents may time out and others are notified. `huge` is used
 * when every waiting agent is notified and none may time out.
 */
$262.agent.timeouts = {
  yield: 100,
  small: 200,
  long: 1000,
  huge: 10000,
};

/**
 * Try to yield control to the agent threads. The default implementation
 * simply waits for `$262.agent.timeouts.yield` milliseconds.
 */
$262.agent.tryYield = function () {
  $262.agent.sleep($262.agent.timeouts.yield);
};

/**
 * Try to sleep the current agent for the given amount of milliseconds. It
 * is acceptable, but not encouraged, to ignore this sleep request and
 * directly continue execution.
 *
 * @param {number} ms Time to sleep in milliseconds.
 */
$262.agent.trySleep = function (ms) {
  $262.agent.sleep(ms);
};
