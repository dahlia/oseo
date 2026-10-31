// Static adaptation of the pinned test262 source:
// Upstream: await-ns-get-nested-namespace-props-nrml.js

function hasOwnProperty(obj, property) {
  return Object.prototype.hasOwnProperty.call(obj, property);
}

function observe(ns) {
  // Export entries defined by a re-exported as exportns module
  assert(hasOwnProperty(ns.exportns, "starAsVarDecl"), "starssVarDecl");
  assert(hasOwnProperty(ns.exportns, "starAsLetDecl"), "starSsLetDecl");
  assert(hasOwnProperty(ns.exportns, "starAsConstDecl"), "starSsConstDecl");
  assert(hasOwnProperty(ns.exportns, "starAsFuncDecl"), "starAsFuncDecl");
  assert(hasOwnProperty(ns.exportns, "starAsGenDecl"), "starAsGenDecl");
  assert(hasOwnProperty(ns.exportns, "starAsClassDecl"), "starAsClassDecl");
  assert(hasOwnProperty(ns.exportns, "starAsBindingId"), "starAsBindingId");
  assert(hasOwnProperty(ns.exportns, "starIdName"), "starIdName");
  assert(
    hasOwnProperty(ns.exportns, "starAsIndirectIdName"),
    "starAsIndirectIdName",
  );
  assert(
    hasOwnProperty(ns.exportns, "starAsIndirectIdName2"),
    "starAsIndirectIdName2",
  );
  assert(hasOwnProperty(ns.exportns, "namespaceBinding"), "namespaceBinding");

  // Bindings that were not exported from any module
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedVar"),
    false,
    "nonExportedVar",
  );
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedLet"),
    false,
    "nonExportedLet",
  );
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedConst"),
    false,
    "nonExportedConst",
  );
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedFunc"),
    false,
    "nonExportedFunc",
  );
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedGen"),
    false,
    "nonExportedGen",
  );
  assert.sameValue(
    hasOwnProperty(ns.exportns, "nonExportedClass"),
    false,
    "nonExportedClass",
  );

  // The upstream negative names differ from the actual declarations.
  // Preserve those checks above, and observe the real private bindings.
  for (const name of [
    "notExportedVar",
    "notExportedLet",
    "notExportedConst",
    "notExportedFunc",
    "notExportedGen",
    "notExportedClass",
  ]) {
    assert.sameValue(hasOwnProperty(ns.exportns, name), false, name);
  }
}
