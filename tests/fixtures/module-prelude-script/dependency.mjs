// Evaluated before the entry; it reads the prelude only through the
// global environment, as an imported test262 module reads the harness.
record("dependency");
export const seen = [typeof record, lexical, fixed, shadowed, this];
export function bump() {
  counter += 1;
  lexical = "module write";
  return counter;
}
