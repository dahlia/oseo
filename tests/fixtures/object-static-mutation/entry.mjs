import "./side-effect.mjs";

const result = Object.assign({}, { value: "module mutation" });
console.log(result.value);
