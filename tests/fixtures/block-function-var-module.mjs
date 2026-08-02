/* oxlint-disable no-shadow, block-scoped-var */
/* oxlint-disable unicorn/consistent-function-scoping */
// This fixture deliberately exercises a block function and a var binding
// with one name. Module code is always strict, so no Annex B extension
// could apply even on a host that implements it.
var value = "module outer";
let readBlock;

{
  readBlock = function () {
    return value();
  };
  function value() {
    return "module block";
  }
  console.log("module block", value());
}

console.log("module outer", value, readBlock());

export const retained = value;
