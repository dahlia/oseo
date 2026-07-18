async function fail() {
  throw "dependency rejection";
}

fail();
