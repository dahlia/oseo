console.log("object var before", value, fallback);
var { value, missing: fallback = 2 } = await Promise.resolve({ value: 1 });
console.log("object var after", value, fallback);
