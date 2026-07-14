M1 language profile and diagnostic contract
===========================================

Status
------

This document freezes the source-language target for the M1 generic native
slice. It does not describe later Oseo releases. Adding syntax to this profile
requires a plan that names the complete generic semantics and differential
tests for that syntax.


Program model
-------------

An M1 input is one script. Static and dynamic modules are outside the profile.
The script is parsed as ECMAScript with the TypeScript syntax plugin enabled,
then converted to Oseo-owned syntax before profile validation. Parser nodes,
tokens, and exceptions do not cross that frontend boundary.

M1 evaluates code with ordinary ECMAScript ordering. Calls evaluate the callee
and arguments from left to right. Binary operations evaluate the left operand
before the right operand. Abrupt completion stops later evaluation.


Accepted values
---------------

M1 accepts these primitive values:

 -  `undefined`, `null`, and both Boolean values;
 -  every IEEE 754 binary64 number, including `NaN`, infinities, and negative
    zero;
 -  strings, with ECMAScript UTF-16 code-unit semantics.

Big integers, symbols, objects, arrays, regular expressions, and function
values are outside the profile. A declared function can be called by its
statically resolved name, but it cannot be stored, returned, or passed as a
value.


Accepted syntax
---------------

The script may contain top-level function declarations, `const` declarations,
and expression statements. A function body may contain `const` declarations,
expression statements, `if` statements with an optional `else`, nested block
statements, and `return` statements. A `const` declaration has one identifier
binding and an initializer. Oseo preserves lexical scope, temporal dead zones,
and the error caused by reading an uninitialized binding.

Functions have plain identifier parameters. Missing arguments bind to
`undefined`; extra arguments are evaluated and then ignored. Direct calls to a
declared function may recurse. Default values, destructuring, rest parameters,
methods, generators, asynchronous functions, nested functions, closures,
constructors, `this`, and `new.target` are outside the profile.

Expressions are limited to:

 -  primitive literals and the `undefined` identifier;
 -  references to lexical bindings and statically resolved function names;
 -  parenthesized expressions;
 -  the unary operators `-` and `!`;
 -  `+`, `-`, `*`, and `/`;
 -  strict equality and inequality with `===` and `!==`;
 -  relational comparison with `<`, `<=`, `>`, and `>=`;
 -  direct calls to declared functions;
 -  the `console.log(...)` host intrinsic.

Numeric operators apply the ECMAScript conversions for the admitted primitive
values. Addition performs string concatenation when either primitive operand
becomes a string; otherwise it performs numeric addition. Relational string
comparison uses UTF-16 code units. Strict equality distinguishes types and
preserves the specified behavior of `NaN`, positive zero, and negative zero.
Conditionals and `!` use ECMAScript Boolean conversion for every admitted
primitive value.

The only accepted property expression is the exact `console.log` intrinsic.
The M1 differential harness binds it to a deterministic host operation. The
operation applies the ECMAScript `String` conversion to each admitted primitive
value, joins the results with one space, writes one line feed, and returns
`undefined`.


Optimization hints
------------------

A plain identifier parameter, binding, or return position may carry a
TypeScript annotation using `number`, `string`, `boolean`, `undefined`, `null`,
`unknown`, or `any`. JSDoc `@param` and `@returns` annotations are retained with
their provenance. M1 records these hints but does not specialize from them.
Adding, removing, or falsifying a hint cannot change whether the program is
accepted or how it behaves.

Type aliases, interfaces, generic parameters, unions, intersections,
assertions, `satisfies`, enums, namespaces, parameter properties, and legacy
decorators are outside the profile. Oseo does not invoke the TypeScript type
checker.


Features held back by prerequisites
-----------------------------------

Assignment and loops need mutation and loop-aware control-flow lowering.
Function values and nested functions need closures and heap environments.
Property access needs the generic object and prototype model. Loose equality
needs the full abstract-equality conversion graph. `throw`, `try`, and `catch`
need language-visible exception objects even though the native call ABI already
represents abrupt completion. Modules need graph resolution, instantiation, and
live bindings. Promises and asynchronous functions need a job queue. These
features remain unsupported until their prerequisites enter a later plan.


Failure classes
---------------

Oseo reports four disjoint failure classes:

| Code       | Class                        | Boundary                                                         |
| ---------- | ---------------------------- | ---------------------------------------------------------------- |
| `OSEO0001` | Parse failure                | The source is not valid input for the bootstrap parser           |
| `OSEO1001` | Syntax outside the profile   | Valid source uses syntax or a static form not accepted by M1     |
| `OSEO2001` | Unsupported runtime behavior | An ABI or host value reaches an operation outside M1 semantics   |
| `OSEO3001` | Unsupported host capability  | The selected native host cannot provide a required M1 capability |

A parse failure never includes a parser exception. A profile diagnostic names
the smallest source form that is unsupported. A runtime diagnostic identifies
the operation and source range whose admitted inputs were exceeded. A host
diagnostic names the missing capability, not a Node.js, Deno, or C stack frame.


Diagnostic data
---------------

Every diagnostic has this Oseo-owned shape:

~~~~ ts
type DiagnosticCode = "OSEO0001" | "OSEO1001" | "OSEO2001" | "OSEO3001";

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

interface Position {
  readonly line: number;
  readonly column: number;
}

interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
  readonly message: string;
  readonly notes?: readonly string[];
}
~~~~

Byte offsets count UTF-8 bytes and use a half-open range. Lines and columns are
one-based Unicode scalar-value positions and also form a half-open range. A
zero-width range identifies the point where parsing or validation stopped. The
source identifier is supplied by the caller and remains unchanged in emitted
MIR, C, and runtime diagnostics.

The text renderer uses this first line:

~~~~ text
<sourceId>:<line>:<column>: error[<code>]: <message>
~~~~

Diagnostic codes and source ranges are stable contracts. Message wording and
notes may become more specific without changing the code. User-facing output
must not contain a bootstrap-parser exception or a host stack trace.


Required M1 fixtures
--------------------

The M1 plan derives differential fixtures for every accepted literal,
conversion, operator, declaration, branch, call, and return rule above. It also
includes negative fixtures for every withheld feature and one fixture for each
diagnostic class. Number fixtures cover `NaN`, infinities, overflow to infinity,
and negative zero. Call fixtures cover recursion, missing arguments, extra
arguments, nested calls, and abrupt runtime failure.
