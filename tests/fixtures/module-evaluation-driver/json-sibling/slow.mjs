import data from "./data.json" with { type: "json" };
console.log("slow start", data.name);
await 0;
data.items.push(4);
console.log("slow done");
