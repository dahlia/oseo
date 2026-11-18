Examples
========

Build and run the example
-------------------------

After [building the checkout](./install.md#build-from-a-checkout), run these
commands from the repository root. They compile a TypeScript program that
reads a JSON array of pairs from standard input and adds each pair. The
argument `1` requests one pass through the array.

~~~~ sh
mkdir -p artifacts
mise run oseo build examples/numeric-hinted.ts \
  -o artifacts/numeric
printf '[[20,22]]\n' | ./artifacts/numeric 1
~~~~

~~~~ json
{"iterations":1,"results":[42]}
~~~~

`build` leaves the executable at *artifacts/numeric* without starting it.
The executable runs directly, without Node.js or Zig. To compile and run
in one step without retaining the executable, replace `build` with `run`
and omit the `-o` option. The [CLI reference](../cli.md) also covers
intermediate representation and C output.

The [examples directory] includes the numeric program without annotations,
another variant with deliberately wrong annotations, a line matcher, and a
small ray tracer.

[examples directory]: https://github.com/dahlia/oseo/tree/main/examples
