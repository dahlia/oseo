Generic calls and abrupt completion
===================================

Status
------

Accepted.


Context
-------

Generic calls must return either a JavaScript value or an abrupt completion
without relying on `setjmp`, a host exception, or hidden thread-local state.
The same convention must leave room for closures, constructors, rest
parameters, and private specialized entries.


Required contract
-----------------

Only the generic entry is stable across independently compiled units. It
receives an `OseoContext`, callee and receiver values, an argument count and
contiguous argument values, and an optional `new.target` value. It returns both
a status and one `OseoValue`. `return`, `break`, and `continue` are resolved
inside the compiled function; a thrown value is the abrupt completion that
crosses a call boundary.


Alternatives considered
-----------------------

The C probe compares a two-word result returned by value with a status return
and output pointer. A direct `OseoValue` return is retained for private helpers
that are proven not to throw. `setjmp` and `longjmp` were rejected for the
initial ABI because they bypass explicit root cleanup and obscure native and
host frames. Postponing the choice would leave every package to invent a call
shape.


Probe evidence
--------------

The M0 probe executed normal, nested, abrupt, allocating, and forced-collection
paths. It emitted both ABI variants and a non-throwing helper. The synthetic
comparison was retired after native and property tests exercised the selected
ABI with production-generated code. Commit `52ae40e` preserves its source.


Observed results
----------------

Both generic variants preserved results and abrupt values while explicit root
frames remained balanced. On x86-64, the optimized status-plus-output and
returned-result probes each contained 16 instructions. On AArch64, the output
form contained 14 instructions and the returned result contained 12. The
private non-throwing helper contained 8 instructions on x86-64 and 5 on
AArch64. These small synthetic counts do not predict whole-program performance,
but they give no reason to pay for an output pointer in the initial ABI.


Decision
--------

Return this two-word C value from a generic entry:

~~~~ c
typedef enum {
    OSEO_STATUS_NORMAL = 0,
    OSEO_STATUS_THROW = 1,
} OseoStatus;

typedef struct {
    OseoStatus status;
    OseoValue value;
} OseoResult;
~~~~

The generic conceptual signature is:

~~~~ c
OseoResult oseo_call(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
~~~~

An ordinary call passes `undefined` as `new_target`. Closure state is reached
through the callee. Constructors receive an allocated receiver and non-undefined
`new_target`. Rest parameters read the same argument vector. Private specialized
entries may use unboxed arguments or direct returns, but every fallback and
cross-unit call converges on the generic signature.


Consequences
------------

Callers test status before reading a normal value. A thrown JavaScript value is
carried in the same value field. Diagnostic and native-stack metadata remain in
`OseoContext`; they are not encoded in `OseoValue`. Generated cleanup, including
root-frame removal, occurs before either result is returned.


Failure modes and replacement triggers
--------------------------------------

Revisit the result shape if a supported platform's C ABI does not return the
two-word struct predictably, if foreign host calls need a different stable
boundary, or if measured call-heavy M1 fixtures show material copying. The
named check is “M1 generic-call differential ABI,” which runs recursion,
missing and extra arguments, thrown runtime failures, and forced collection
through separately compiled callers and callees.


Links
-----

[*0004-generic-tagged-value.md*](./0004-generic-tagged-value.md) defines the
value field.
[*0006-root-stack-and-safepoints.md*](./0006-root-stack-and-safepoints.md)
defines cleanup around calls that may collect.
