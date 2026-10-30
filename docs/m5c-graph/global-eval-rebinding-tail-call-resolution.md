Rebound global eval tail-call resolution
========================================

The source assigns its statically declared ordinary function to the global
eval binding, then calls that function recursively with numeric arguments.
It never invokes source evaluation. The focused observation reports
`OSEO1001: Unknown binding eval`; retain its unsupported classification
until the original binding and tail-call contract passes.

Original path:

 -  `test/language/expressions/call/tco-non-eval-global.js`

Pinned source SHA-256:
`f94189f89e34ede682bb5745abb28cb8dd75b60e1d5011037bfbc49b737d1cce`.
The source is test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

Root approved this bounded owner after the first internal review round.
The ordinary binding/call rejection grants no ADR exclusion and does not
change ADR 0016. Repair the reference resolution without allowing dynamic
source compilation, then re-observe the exact original.

[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json)
retain the original result. Its dynamic-source tag and former exclusion
assessment are removed; its actual observation and classification are preserved.
