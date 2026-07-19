// Reading a later clause's lexical binding before its clause runs is a
// TDZ error observable across the shared case-block scope. This runs as
// a direct native check because Deno 2.9.2 transpiles a case-level let
// in .ts sources in a way that loses the TDZ, so the ordinary
// differential fixture protocol cannot compare it. Node.js prints
// "case tdz" for this source, matching the specification.
function readBeforeClause(value) {
  switch (value) {
    case 1:
      return typeof later;
    case 2:
      let later = "set";
      return later;
  }
  return "none";
}
try {
  console.log(readBeforeClause(1));
  // eslint-disable-next-line no-unused-vars -- Catch is the observation.
} catch (caught) {
  console.log("case tdz");
}
console.log(readBeforeClause(2), readBeforeClause(3));
