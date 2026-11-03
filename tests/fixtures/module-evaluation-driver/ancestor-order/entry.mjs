// Every module that waits on the leaf becomes available in the leaf's
// fulfillment job, and the synchronous ones run in async-evaluation order
// before any reaction queued in the meantime.
import "./sync-c.mjs";
import "./sync-d.mjs";
import "./leaf.mjs";
console.log("entry");
