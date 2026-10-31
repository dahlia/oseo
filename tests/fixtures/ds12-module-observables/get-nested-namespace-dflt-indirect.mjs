import * as ns from "./get-nested-namespace-dflt-skip-named_FIXTURE.mjs";
observe(ns);
await Promise.resolve(ns).then(observe);
console.log("ok");
