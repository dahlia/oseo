console.log("var module before", value, fallback, later);

var [value, fallback = 2] = await Promise.resolve([1]);
var plain = 3,
  [later = 4] = [];

console.log("var module after", value, fallback, plain, later);
