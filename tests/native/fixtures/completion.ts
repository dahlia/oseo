/** Original general cleanup witnesses from 7d8445b1/90693863. */
export const completionTargetSource = `"use strict";
// A finally whose own statements always leave abruptly has no completion
// to resume, so its try statement's after block and break or continue
// targets are never entered.
let finallySteps = 0;
const finallyHop0 = (n) => {
  finallySteps += 1;
  try { finallySteps += 0; } finally {
    try { throw 0; } catch (error0) {
      if (n === 0) { return "done 0"; }
      return (() => {
        try { throw 0; } catch (error) {
          return finallyHop1.apply(null, [n - 1]);
        } finally { finallySteps += 0; }
      })();
    }
  }
};
const finallyHop1 = (n) => {
  finallySteps += 1;
  if (n === 0) { return "done 1"; }
  return (() => {
    try { throw 0; } catch (error) {
      return finallyHop0.apply(null, [n - 1]);
    } finally { finallySteps += 0; }
  })();
};
console.log("finally chain", finallyHop0(0), finallyHop0(5), finallySteps);
function finallyCatch() {
  try { } finally { try { throw 0; } catch (error) { return "catch"; } }
}
function finallyBreak() {
  label: { try { break label; } finally { return "break"; } }
  return "after break";
}
function finallyContinue() {
  for (let i = 0; i < 3; i++) {
    try { continue; } finally { return "continue " + i; }
  }
  return "after loop";
}
function finallyNested() {
  label: {
    try { break label; } finally {
      try { throw 0; } catch (error) { return "nested"; }
    }
  }
  return "after nested";
}
function finallyThrow() {
  try {
    label: { try { break label; } finally { throw new RangeError("thrown"); } }
    return "after throw";
  } catch (error) {
    return error.message;
  }
}
for (const run of [
  finallyCatch, finallyBreak, finallyContinue, finallyNested, finallyThrow,
]) {
  console.log("finally", run.name, run());
}
const finallyLog = [];
function finallyResumes(n) {
  label: {
    try { if (n) break label; return "return"; } finally { finallyLog.push(n); }
  }
  return "break";
}
console.log("resume", finallyResumes(0), finallyResumes(1), finallyLog.join());
function* finallyYields() {
  try { yield 1; } finally { finallyLog.push("yield"); }
  yield 2;
}
console.log("resume generator", [...finallyYields()].join(), finallyLog.join());
function* finallyReturns() {
  try { yield 1; } finally { try { throw 0; } catch (error) { return 3; } }
}
const finallyIterator = finallyReturns();
console.log(
  "generator finally",
  JSON.stringify(finallyIterator.next()),
  JSON.stringify(finallyIterator.next()),
);
// A default parameter runs in a call-time prologue before the generator or
// async body; a return through a finally inside that body must not reach
// the prologue again.
const defaultLog = [];
function* defaultYields(n = 1) {
  label: {
    try { if (n) break label; yield "body"; } finally { defaultLog.push(n); }
  }
  try { return yield n; } finally { defaultLog.push("returned"); }
}
const defaultIterator = defaultYields();
console.log(
  "default generator",
  JSON.stringify(defaultIterator.next()),
  JSON.stringify(defaultIterator.next("resumed")),
  [...defaultYields(0)].join(),
  defaultLog.join(),
);
async function defaultAsync(a = 2) {
  try { return a; } finally { defaultLog.push("async"); }
}
async function* defaultAsyncYields(a = 3) {
  try { yield a; } finally { defaultLog.push("async generator"); }
}
defaultAsync().then((value) => console.log("default async", value));
defaultAsyncYields().next().then((step) => {
  console.log("default async generator", JSON.stringify(step));
});
`;
