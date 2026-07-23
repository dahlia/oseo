let value;
const input = [1];
[value] = await Promise.resolve(input);
console.log("assignment module", value);
