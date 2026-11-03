// The leaf's rejection reaches every waiting ancestor through its
// async parent list, so neither the parent nor the entry evaluates.
import "./independent.mjs";
import "./sync-parent.mjs";
console.log("entry must not run");
