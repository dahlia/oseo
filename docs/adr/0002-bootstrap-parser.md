Bootstrap parser and owned-syntax boundary
==========================================

Status
------

Accepted.


Context
-------

The bootstrap frontend needs TypeScript syntax, comments, tokens, exact source
ranges, and recoverable diagnostics under both development hosts. Parser data
must stop at the frontend boundary because the parser is replaceable and is not
part of the restricted compiler core.


Required contract
-----------------

The parser adapter receives source text and a source identifier. It returns
only Oseo-owned syntax, hints with provenance, comments or tokens needed by the
frontend, and Oseo diagnostics. No parser node, token object, exception, helper,
or source-location type crosses that interface.


Alternatives considered
-----------------------

The probe compared `@babel/parser` 8.0.4 with Acorn 8.17.0 plus
`acorn-typescript` 1.4.13. Acorn TypeScript is a credible small, pure-JavaScript
candidate. Parser libraries backed by the TypeScript compiler API violate the
bootstrap constraint. Native parser bindings add a host portability dependency.
A hand-written parser is postponed until Oseo's self-hosting profile can justify
its cost.


Probe evidence
--------------

*experiments/parser/corpus.ts* contains valid M1 candidates, TypeScript and
JSDoc hints, fatal and recoverable errors, unsupported but parseable syntax,
Unicode identifiers, ambiguous comments, and CRLF input. The candidate adapters
convert their result to *experiments/parser/schema.ts* before serialization.
Run:

~~~~ sh
mise run probe:host-parser
~~~~


Observed results
----------------

Each candidate produced byte-for-byte equal owned JSON under Node.js and Deno.
Both retained comments, tokens, TypeScript annotations, and UTF-8 byte ranges.
Babel attached the leading JSDoc block to its function and retained owned
statements after the recoverable duplicate-parameter error. Acorn TypeScript
treated that error as fatal. It also reported an impossible end range for the
untyped parameter after a JSDoc block: byte 23 followed a start at byte 65.

Single cold-process observations put both candidates in the tens of
milliseconds. That measurement was too small and noisy to drive the choice.
Source fidelity and recoverable diagnostics did drive it.


Decision
--------

Use `@babel/parser` 8.0.4 behind a Babel-specific frontend package. Enable the
TypeScript syntax plugin, comment attachment, token retention, and recoverable
errors. Catch fatal parser exceptions at the adapter boundary. Convert both
fatal and recoverable errors to `OSEO0001` diagnostics from
[*docs/language-profile-m1.md*](../language-profile-m1.md).


Consequences
------------

Only the Babel adapter imports `@babel/parser`. The compiler package owns every
type returned by the adapter. M0 exposes comment and token information only
through deliberately small Oseo types. Startup time is not optimized before a
real compiler workload exists.


Failure modes and replacement triggers
--------------------------------------

Reopen the choice if Babel stops running in either host, loses source fidelity,
adds unacceptable startup or distribution cost, or blocks the self-hosting
path. The replacement corpus must match owned output, not Babel's AST layout.
The named self-hosting experiment is “M1 owned-syntax parser replay”: serialize
frontend output for every M1 fixture, parse it with the replacement candidate,
and compare the owned trees and diagnostics.


Links
-----

[*docs/language-profile-m1.md*](../language-profile-m1.md) defines profile
validation after parsing.
[*0001-initial-platform-and-tools.md*](./0001-initial-platform-and-tools.md)
pins the two hosts.
