import * as ns from "./get-nested-namespace-dflt-skip-prod_FIXTURE.mjs";
observe(ns);
await Promise.resolve(ns).then(observe);
console.log("ok");
