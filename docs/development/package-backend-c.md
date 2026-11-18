C backend implementation notes
==============================

The [design document] describes the MIR boundary and lowering rules. The
[root-stack decision] specifies how generated root frames and safepoints
interact with collection, and the [fragment ABI] covers split harness builds.

[design document]: https://github.com/dahlia/oseo/blob/main/DESIGN.md
[root-stack decision]: https://github.com/dahlia/oseo/blob/main/docs/adr/0006-root-stack-and-safepoints.md
[fragment ABI]: https://github.com/dahlia/oseo/blob/main/docs/harness-fragment-abi.md


C emission
----------

The backend emits only functions reachable from the script and blocks
reachable from their function entry. Self-recursive calls use a volatile
function pointer to keep strict C warning settings from rejecting valid
recursion. Value-slot discovery scans MIR argument IDs iteratively so wide
argument lists do not consume the JavaScript stack during emission.

UTF-16 string constant data is emitted as static read-only storage rather than
automatic compound literals, so literal size does not enlarge the generated
stack frame. Generated entry code passes diagnostic source identifiers with
their UTF-8 byte lengths.

Binding reads, property-key conversions, and ordinary property gets in whole
programs use statically selected runtime helpers. Their call-site records
carry root indices and source positions, reducing generated operand loads and
result stores without moving guards or abrupt routing out of MIR. Fragment
emission keeps its dynamically relocated source-location call. See the
[property cost investigation] for the motivation and measurements.

[property cost investigation]: https://github.com/dahlia/oseo/blob/main/docs/m5c-graph/array-generated-property-cost-remediation.md


Large native bodies
-------------------

Generated callable entries charge call depth and active root slots before
running their bodies. Values and argument scratch slots live in heap-backed
root frames. The toolchain supplies the multiplier in
`OSEO_CALLABLE_FRAME_COST`; scripts account for dense value slots and binding
accesses separately. A preprocessor branch omits bodies that are guaranteed to
exceed the frame budget before the C compiler constructs sanitizer IR. Their
entry points still report the runtime charge.

Large bodies can run in bounded C helpers that return continuation indices to
an iterative owner. The owner retains roots, completion records, and scalar
state, releasing its frame once on either normal or abrupt completion. The
logical frame charge and 65,536-unit ceiling still apply.

Splitting the functions inside a single translation unit does not bound
compiler IR retention for unoptimized sanitizer builds. For large programs,
the backend can also emit wrapper files that select groups of definitions from
the full C file. Native composition compiles those wrappers as separate units
without cross-unit LTO. The complete translation unit remains available to
`--emit-c`. See the [wide-frame investigation] for how these limits were
measured.

[wide-frame investigation]: https://github.com/dahlia/oseo/blob/main/docs/evidence/m5c-array-sort-stability/README.md
