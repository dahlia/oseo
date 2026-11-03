import "./slow.mjs";
import data from "./data.json" with { type: "json" };
console.log("entry", data.items.join(","));
