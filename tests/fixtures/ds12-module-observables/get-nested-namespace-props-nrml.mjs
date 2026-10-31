import * as ns from "./get-nested-namespace-props-nrml-1_FIXTURE.mjs";
observe(ns);
await Promise.resolve(ns).then(observe);
console.log("ok");
