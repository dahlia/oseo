Iterator helpers split
======================

This record backs the M5c umbrella node `iterator-helpers`. The maintainer
decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, splits it into
`iterator-helpers-tag-activation` (IH-A) and `temporal-helpers-harness`
(IH-B). The umbrella depends on both and lands when it owns zero paths.

The 393 paths assigned to `node:iterator-helpers` in the derived closure
ledger stay with the umbrella until a child lands. IH-A's landing moves
every path it observes to its observed owner and assigns the three
*temporalHelpers.js* paths to IH-B; IH-B's landing moves those three. This
change moves no ledger ownership.

IH-A comes first, because it moves about 390 paths without a product
change. Separating IH-B keeps the harness review risk out of that landing.
