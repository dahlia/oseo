import "./a.mjs";
console.log("c sync");
Promise.resolve().then(() => console.log("c reaction"));
