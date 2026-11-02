Class declaration private accessor closure
==========================================

The 2026-11-02 maintainer decision closes exactly two class declaration paths
under ADR 0013's optional Annex B boundary, on the conditions of item 3 of
the 2026-11-01 decision. Both are under
*test/language/statements/class/elements/*:

 -  *private-getter-is-not-a-own-property.js*;
 -  *private-setter-is-not-a-own-property.js*.

Observation batch 22b admitted both. Each observes the owned `OSEO1001`
rejection of the optional `__lookupGetter__` or `__lookupSetter__` call
before its private accessor assertions, and both are owned by
`node:class-private-accessor-lookup-coverage-remediation`.

The conditions are a new fresh-digest exclusion audit record that names the
replacement fixtures and passes review, and a closing commit that lands
through CI that includes macOS. The class expression pair closed the same
way; its
[work note](./class-private-accessor-lookup-coverage-remediation.md)
describes the replacement contract this node reuses. The two upstream tests
differ from their expression forms only in declaring `class C` instead of
assigning a class expression to `var C`, so this node adds class declaration
fixtures beside the expression ones. Neither path counts as a pass.
