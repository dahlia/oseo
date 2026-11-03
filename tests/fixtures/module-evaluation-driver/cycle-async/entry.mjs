// A cycle with two awaiting members: the cycle root waits for both, and
// a module that requests a non-root member still waits for the root.
import "./observer.mjs";
import { b } from "./b.mjs";
console.log("entry", b);
