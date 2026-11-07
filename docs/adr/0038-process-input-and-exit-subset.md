ADR 0038: Node.js process input and exit subset
===============================================

Status
------

Accepted on 2026-11-08 for the program input and exit status unit of
[*PLAN-PREVIEW.md*](../../PLAN-PREVIEW.md). Until that unit lands, compiled
programs have no `process` global and every `node:` specifier stays rejected.

This record admits two builtin modules, `node:process` and
`node:fs`, with the exports listed below. It narrows the classification that
the proposed [ADR 0033](./0033-installed-package-resolution.md) gives `node:`
specifiers: those two become resolvable builtins, and every other `node:`
specifier remains a runtime API finding owned by M7. It also amends
[ADR 0009](./0009-module-identity-and-linking.md), which requires an
amending decision before a non-source module enters the graph; the builtin
module kind below is that decision.


Context
-------

A compiled program can print with `console.log()`, schedule timers, and read
the clock. It cannot read its arguments, environment, or standard input, and
its exit status is 0 on normal completion and 1 on an uncaught exception, an
unhandled rejection, or a runtime diagnostic. Generated `main` takes no
arguments, and the CLI starts the executable with an empty argument list.

`console.log()` converts each argument, encodes UTF-16 as UTF-8 with lone
surrogates replaced by U+FFFD, and writes through C `stdio`. A write failure
ends the program with an `OSEO3001` diagnostic. On normal completion nothing
flushes standard output explicitly; C termination does. The agent failure and
stall reports in *runtime\_agent.c* flush it before printing.

The module resolver accepts only `./` and `../` specifiers, so `node:fs` and
`node:process` fail with `OSEO3001` today. The graph has no builtin module
kind; synthetic JSON modules are the only modules the compiler creates
without JavaScript source.

`Uint8Array` and `ArrayBuffer` are admitted. `Buffer` is not.

WinterTC's [CLI API proposal]
is an early draft. It defines an exit function, arguments, and environment,
but leaves standard input and output undefined and does not name its
argument property. Most command-line JavaScript is written against Node.js.
[*ROADMAP.md*](../../ROADMAP.md) lists a bounded `process` global among the
M7 candidates.

[CLI API proposal]: https://github.com/WinterTC55/proposal-cli-api


Required contract
-----------------

The preview's demonstration programs need to:

 -  read command-line arguments and environment variables;
 -  read all of standard input as text or bytes;
 -  write text and bytes to standard output and standard error, in order
    with `console.log()`;
 -  set the exit status, and exit early; and
 -  run unchanged under Node.js 24 and Deno with the same output, so that
    differential tests compare all three.

M7 needs this subset to be the first part of its `process` and `node:fs`
surface, not something it replaces.


Alternatives considered
-----------------------

 -  Targeting the WinterTC CLI API was rejected for now. Programs written
    against it would not run on Node.js, the draft has no input or output
    yet, and its names may change.
 -  A `Deno` namespace subset was rejected. Deno also implements the Node.js
    `process` global and `node:` modules, so the Node.js interface reaches
    both reference hosts.
 -  Only a global `process`, with no builtin modules, was rejected. Reading
    standard input in Node.js goes through `node:fs`, and code written for
    Node.js often imports `process` from `node:process`.
 -  Returning a `Buffer` from `readFileSync(0)` was deferred to M7. A
    faithful `Buffer` is a large surface, and `Uint8Array` is its superclass.
 -  Exposing `process` only to programs that mention it was rejected. The
    presence of a global would then depend on source text, which
    `globalThis["pro" + "cess"]` makes unobservable to the compiler.


Probe evidence
--------------

Node.js 24.21.0 was run locally to check the behaviors this record matches:
exit status after setting `process.exitCode` and throwing, validation of
`exitCode` values, the property descriptor of `globalThis.process`,
`readFileSync(0, "utf8")` on input with a byte order mark and an invalid
byte, a second read after end of input, `process.exit()` inside `try` with a
pending timer, `process.env` assignment, and writing to a closed pipe. The
single executable application behavior of `process.argv` comes from the
[Node.js documentation].

The implementation adds differential tests for each rule below against
Node.js and, except where the decision names a Deno difference, Deno, with
standard input supplied by the harness. The current `ProcessRequest` has no
input field, so the test harness gains one.

[Node.js documentation]: https://nodejs.org/api/single-executable-applications.html


Observed results
----------------

Under Node.js 24.21.0:

 -  `process.exitCode = 5` followed by an uncaught exception or an unhandled
    rejection exits with status 1.
 -  `process.exitCode = 1.5`, `"5.5"`, `NaN`,
    and `9007199254740992` throw a `RangeError` with code `ERR_OUT_OF_RANGE`;
    `""`, `"abc"`, and `true` throw a `TypeError` with code
    `ERR_INVALID_ARG_TYPE`; `null` reads back as `undefined`; `"7"` is stored
    as the Number 7; `4294967297` reads back as 1 and `2147483648` as
    `-2147483648`; 300 exits with status 44 and -1 with 255.
 -  `globalThis.process` is a non-enumerable, configurable accessor.
 -  `readFileSync(0, "utf8")` keeps a leading U+FEFF and replaces an invalid
    byte with U+FFFD; a second read returns zero bytes.
 -  `process.exit(3)` inside `try` runs neither the `finally` block nor a
    pending timer.
 -  `process.env.X = 5` stores the string `"5"`.
 -  `process.stdout.write()` returns `true` for a short write to a pipe.
 -  Printing 100,000 lines into `head -1` with `console.log()` exits with
    status 0 and no error; with `process.stdout.write()` it exits with status 1
    after an unhandled `EPIPE` error event.

Deno 2.9.7 exposes the same `process` global, exits with the status set in
`process.exitCode`, and decodes an invalid byte from `readFileSync(0, "utf8")`
in `node:fs` as U+FFFD. Into `head -1`, its `console.log()` loop exits with
status 0 and its `process.stdout.write()` loop with status 1, as under
Node.js. The other behaviors above were not checked under Deno; the
differential tests do that.

The Node.js documentation shows `process.argv` in a single executable
application as the executable's path, then the path as invoked, then the
user arguments.


Decision
--------

### Where the subset appears

A `process` global exists in every program, Script and Module alike, in the
initial realm only, in the sense of
[ADR 0027](./0027-realms-beyond-the-initial-realm.md). It is a non-enumerable,
configurable, writable data property of the global object; Node.js uses an
accessor, so the property descriptors differ.

`node:process` and `node:fs` resolve to builtin modules. Builtins are a new
module kind beside JavaScript and JSON. The loader returns a distinct `builtin`
result, and the graph gets a matching builtin node, discriminated by its kind,
with no `syntax`. Code that walks the graph handles the kind explicitly rather
than assuming every node has source.

ADR 0009's requirements carry over to the new kind. A builtin's canonical
identity is its specifier. Its content digest is the digest of its export
table and the runtime ABI version that implements it, so a change to either
changes the graph evidence. A builtin has no dependencies, and the
one-instance rule applies: every import of `node:fs` in a program links to
the same instance. Linking, live bindings, and namespace objects follow ADR
0009. The bare specifiers `process` and `fs` are not aliases for these builtins.
They follow whatever rule governs bare specifiers: today the resolver rejects
them with `OSEO3001`, and under ADR 0033, once accepted, they resolve as
package names. Node.js and Deno resolve `import fs from "fs"` to the
builtin, so this is a deviation; programs written for the preview use the
`node:` form, which both reference hosts accept. Making the bare names
aliases would need ADR 0033 to give builtins precedence over installed
packages, as Node.js does, and is left to M7.

| Module         | Default export                | Named exports                             |
| -------------- | ----------------------------- | ----------------------------------------- |
| `node:process` | the `process` object          | `argv`, `env`, `exit`, `stdout`, `stderr` |
| `node:fs`      | an object with `readFileSync` | `readFileSync`                            |

A static import of any other name from these modules is a link error, as for
any missing export. Every other `node:` specifier is rejected with
`OSEO3001` naming the two admitted builtins. `exitCode` is not a named
export, because a module binding cannot follow assignments to the property.

### Members of `process`

The `process` object is an ordinary object with these own properties and no
others. A read of any other Node.js member returns `undefined`, which is the
main deviation a program can observe.

`process.argv` is an array of strings created at startup. Element 0 is the
absolute path of the running executable, element 1 is the executable path as
the operating system passed it, and the remaining elements are the
command-line arguments. This matches Node.js single executable
applications, so `process.argv.slice(2)` gives the user arguments under
Oseo, Node.js, and Deno alike. `oseo run SOURCE -- ARGS...` passes `ARGS` to
the program. Bytes that are not valid UTF-8 decode to U+FFFD.

`process.env` is an ordinary object created at startup with one string
property per environment entry, decoded the same way. Changes to it are not
written to the operating system environment; nothing in this subset could
observe them. Unlike Node.js, assigning a non-string value stores the value
unchanged. Keys are case-sensitive on both execution targets.

`process.exitCode` is an accessor pair on `process` that follows Node.js
24.21.0:

 -  `undefined` and `null` are stored as `undefined`.
 -  A Number, or a non-empty string whose Number conversion is not `NaN`,
    must convert to a safe integer. It is stored as that integer converted
    to a signed 32-bit integer, so `4294967297` reads back as 1 and
    `2147483648` as `-2147483648`.
 -  A Number or numeric string that is not a safe integer, including `NaN`,
    infinities, `1.5`, and `9007199254740992`, throws a `RangeError` with
    code `ERR_OUT_OF_RANGE`.
 -  Any other value, including `""`, `"abc"`, and `true`, throws a
    `TypeError` with code `ERR_INVALID_ARG_TYPE`.

Deno 2.9.7 validates and stores differently. It keeps `"7"` as a string,
reads `null` back as `null`, throws a `TypeError` for `"5.5"`, stores
`9007199254740992` and `4294967297` unchanged, and keeps `exitCode` after
`process.exit(undefined)`. The exit statuses that result agree with Node.js
where both accept a value. Differential tests therefore compare validation,
read-back, and the `process.exit(undefined)` case with Node.js alone, and
compare Deno only on the resulting exit status.

`process.exit([code])` validates `code` like `process.exitCode`. When the
argument is supplied, it is assigned to `exitCode`, so an explicit
`undefined` clears it; when it is omitted, `exitCode` is kept. Node.js
24.21.0 exits with 5 after `process.exitCode = 5; process.exit()` and with 0
after `process.exit(undefined)`. It then flushes standard output and standard
error and ends the process. It runs no `finally` block, promise job, or timer,
and it does not return.

`process.stdout.write(chunk[, encoding])` and `process.stderr.write()` accept
a string or a `Uint8Array`. A string is encoded as UTF-8 with lone
surrogates replaced, as `console.log()` does; a `Uint8Array` is written as its
bytes. The only accepted encoding is `"utf8"` or `"utf-8"`, and it may be
omitted. A callback argument throws a `TypeError`. A write is synchronous and
returns `true`. Standard output shares one buffer with `console.log()`, so
their output keeps program order.

### Standard input

`readFileSync(fd[, options])` from `node:fs` accepts only file descriptor 0.
It reads standard input until end of input, blocking, and does not close
it. With the encoding `"utf8"` or `"utf-8"`, as a string or as
`{ encoding }`, it returns a string decoded with U+FFFD replacement and keeps
a leading byte order mark, as Node.js does. Without an encoding it returns a
`Uint8Array`, where Node.js returns a `Buffer`; `toString()` on the result
therefore differs. A later call after end of input returns an empty result.

Any other first argument, including a path, ends the program with an
`OSEO3001` diagnostic that names the supported form. The same diagnostic
covers other encodings and options.

### Exit status

The exit status is chosen in this order:

1.  An uncaught exception, an unhandled rejection, or a runtime diagnostic
    gives status 1, whatever `exitCode` holds.
2.  Otherwise `process.exit()` or normal completion gives `exitCode` modulo
    256, or 0 when it is `undefined`.

Normal completion still waits for the event loop, so pending timers and
promise jobs run before the program ends.

### Output errors

Oseo ignores `SIGPIPE`. The result of `EPIPE` depends on which API wrote,
because it does in Node.js and Deno:

 -  When `console.log()`, or the flush at exit, fails with `EPIPE`, the
    stream discards all later output and the program continues. Its status
    is unaffected, as for `node program.js | head`.
 -  When `process.stdout.write()` or `process.stderr.write()` fails with
    `EPIPE`, the program ends with an `OSEO3001` diagnostic naming `EPIPE`
    and status 1. Node.js reports the error asynchronously as an unhandled
    `error` event, so code after the write in the same turn still runs
    there; Oseo stops at the write. Differential tests for this case compare
    the status, not standard error.

Any other write or flush failure ends the program with an `OSEO3001`
diagnostic and status 1.

### Ownership

The runtime owns argument, environment, and standard stream access and
reserves its code range, intrinsic indexes, and property blocks under
[*docs/runtime-components.md*](../runtime-components.md) before
implementation. The compiler owns the builtin module records. The CLI owns
passing arguments after `--`.

M7 may add members, exports, and builtin modules. Changing the meaning of a
member admitted here, such as returning a `Buffer` from `readFileSync()`,
requires a record that supersedes this one.


Consequences
------------

Every program's global object gains `process`, so test262 observations that
list global own keys can change. The implementation runs the complete
test262 update and reviews each changed record.

Programs written for Node.js compile without change when they use only the
admitted forms and do not depend on the deviations above. A program
that uses `Buffer`, streams on `process.stdin`, other `node:fs` functions,
or other `process` members does not; static imports fail at link time and
property reads return `undefined`.

The differential harness gains standard input and byte-exact output
comparison, which later NIO and M7 work can reuse.

*docs/cli.md* drops its statement that standard input is unsupported and
documents `oseo run SOURCE -- ARGS...` when the implementation lands.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if:

 -  a demonstration or corpus program needs a member outside the subset that
    cannot wait for M7;
 -  Node.js or Deno changes a matched behavior, such as `exitCode`
    validation;
 -  the WinterTC CLI API defines input and output and gains an implementation
    in a reference host;
 -  ignoring `SIGPIPE` conflicts with a later subprocess or signal API; or
 -  a builtin module record cannot meet ADR 0009's graph evidence rules.


Links
-----

 -  [*PLAN-PREVIEW.md*](../../PLAN-PREVIEW.md) defines the unit this record
    serves.
 -  [ADR 0009](./0009-module-identity-and-linking.md) defines module identity
    and linking.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) keeps the graph closed.
 -  [ADR 0033](./0033-installed-package-resolution.md) classifies other
    `node:` specifiers.
 -  [*PLAN-NIO.md*](../../PLAN-NIO.md) and [*PLAN-M6.md*](../../PLAN-M6.md)
    own file transport and streams.
