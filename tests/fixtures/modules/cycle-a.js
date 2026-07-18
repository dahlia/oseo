import "./cycle-b.js";
import "./cycle-c.js";

export function fromA() {
  return "ready";
}

export default function () {
  return "default ready";
}

console.log("cycle a");
