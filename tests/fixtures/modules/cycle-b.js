import { fromA } from "./cycle-a.js";
import defaultFunction from "./cycle-a.js";

console.log("cycle b", fromA(), defaultFunction());
