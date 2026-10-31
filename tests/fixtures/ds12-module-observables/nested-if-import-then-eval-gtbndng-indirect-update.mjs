// Static adaptation of the pinned test262 source:
// Upstream: nested-if-import-then-eval-gtbndng-indirect-update.js
import * as importedNamespace from "./eval-gtbndng-indirect-update_FIXTURE.mjs";

if (true) {
  Promise.resolve(importedNamespace)
    .then((imported) => {
      assert.sameValue(imported.x, 1);

      // This function is exposed on the global scope (instead of as an exported
      // binding) in order to avoid possible false positives from assuming
      // correct
      // behavior of the semantics under test.
      globalThis.test262update();

      assert.sameValue(imported.x, 2);
    })
    .then($DONE, $DONE)
    .catch($DONE);
}
