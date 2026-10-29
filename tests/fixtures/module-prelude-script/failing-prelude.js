// A prelude Script whose function throws when a module calls it.
function fail() {
  throw new Error("prelude failure");
}
