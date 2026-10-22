import { early, lexical, peek } from "./cycle-a.mjs";

// This module evaluates before cycle-a.mjs: its var bindings already exist
// as undefined, while its let binding is still in the temporal dead zone.
export const records = [`early ${String(early)}`, `peek ${String(peek())}`];
try {
  records.push(`lexical ${lexical}`);
} catch (error) {
  records.push(`lexical ReferenceError ${error instanceof ReferenceError}`);
}
export const readEarly = () => early;
