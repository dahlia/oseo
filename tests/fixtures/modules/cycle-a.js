import "./cycle-b.js";
import "./cycle-c.js";

export function fromA() {
  return Number === Number ? "ready" : "broken";
}

export default function () {
  return "default ready";
}

console.log("cycle a");
