import { aState } from "./cycle-a.mjs";
import "./observer.mjs";
import "././cycle-a.mjs";
import { bState } from "./cycle-b.mjs";
import "./sibling.mjs";

console.log("entry", aState, bState);
