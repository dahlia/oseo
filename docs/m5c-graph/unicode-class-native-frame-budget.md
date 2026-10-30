Unicode class native frame budget
=================================

The focused observation on `68b026bb` failed these ten complete pinned
sources at runtime with OSEO2001, “Maximum active native frame budget
exceeded.” Each recorded only the first non-strict variant with
specialization disabled; no pass is inferred for the unreached variants.
The
[raw failures](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/semantic-failures.json)
retain the source hashes, exact diagnostics, and execution records.

The cause has not been established. The bounded repair must investigate
frame lifetime across sequential class declarations and private fields.
It must preserve the existing budget and every upstream assertion and
validate all ten sources under both strictness and specialization modes,
plus ordinary/private-class controls for the affected semantic unit.

Root authorized registering this prerequisite and admitting the other
944 train paths. These ten remain unreviewed under batch 18; this work
adds no product fix, failure reclassification, or exclusion.


Exact reserved paths
--------------------

 -  *test/language/identifiers/start-unicode-10.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-10.0.0-class.js*
 -  *test/language/identifiers/start-unicode-13.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-13.0.0-class.js*
 -  *test/language/identifiers/start-unicode-5.2.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-5.2.0-class.js*
 -  *test/language/identifiers/start-unicode-8.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-8.0.0-class.js*
 -  *test/language/identifiers/start-unicode-9.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-9.0.0-class.js*
