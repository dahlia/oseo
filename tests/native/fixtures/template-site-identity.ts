import type { Fixture } from "../fixture.ts";

/** Distinct Parse Nodes cache independently; closures share their own site. */
export const templateSiteIdentityFixture: Fixture = {
  name: "template-site-identity",
  source: `
const objects = [];
const substitutions = [];
function tag(template, a, b) {
  objects.push(template);
  substitutions.push(a + ":" + b);
}
// Identical bodies at distinct static Parse Nodes replace the two evals.
function first(a) {
  return function () {
    for (let b = 0; b < 2; b++) { tag\`\${a}\${b}\`; }
  };
}
function second(a) {
  return function () {
    for (let b = 0; b < 2; b++) { tag\`\${a}\${b}\`; }
  };
}
first(0)();
second(1)();
console.log("identities", objects[0] === objects[1],
  objects[1] !== objects[2], objects[2] === objects[3]);
console.log("values", substitutions.join(","));
// A fresh closure of the same static function must reuse its Parse Node.
first(2)();
console.log("recreated", objects[0] === objects[4],
  objects[4] === objects[5]);
console.log("all-values", substitutions.join(","));
`,
};
