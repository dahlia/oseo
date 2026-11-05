import "./cycle-member.mjs";

console.log("root evaluates");
await null;
throw new Error("async error in root");
