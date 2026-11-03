// A synchronous throw inside a cycle records the error on every module
// still on the evaluation stack and rejects the entry without draining
// later siblings.
import "./a.mjs";
import "./after.mjs";
console.log("entry must not run");
