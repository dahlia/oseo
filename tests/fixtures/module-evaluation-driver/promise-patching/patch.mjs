// The driver reads no `then`, `constructor`, or species and never calls
// the global Promise, so these patches cannot change module evaluation.
const originalThen = Promise.prototype.then;
let thenCalls = 0;
Promise.prototype.then = function (...args) {
  thenCalls += 1;
  return originalThen.apply(this, args);
};
Object.defineProperty(Promise, Symbol.species, {
  get() {
    console.log("species read");
    return Promise;
  },
});
Promise.all = () => {
  console.log("Promise.all called");
};
Promise.resolve = () => {
  console.log("Promise.resolve called");
};
globalThis.Promise = function () {
  console.log("global Promise called");
};
globalThis.thenCalls = () => thenCalls;
console.log("patched");
