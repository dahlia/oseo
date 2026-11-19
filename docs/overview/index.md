Introduction
============

Oseo compiles JavaScript and TypeScript ahead of time into native code.
With `oseo build`, you can turn a program into an executable for a supported
target and run it without installing Node.js or Deno on the destination
machine. The compiler emits C and links in Oseo's runtime for the language
features the program uses.


Why Oseo exists
---------------

Oseo started with a question: Common Lisp and Scheme are dynamic languages,
yet both have widely used ahead-of-time compilers in SBCL and Chez Scheme.
What would it take for ahead-of-time compilation to be an everyday option
for JavaScript, too?

Shipping command-line tools gave that question a practical use. Node.js SEA
and `deno compile` simplify distribution by putting a program and its engine
in one executable. For a small CLI, the resulting file could still be larger
than the author of Oseo wanted to ship. Oseo takes a different approach: it
compiles the program itself rather than bundling a JavaScript engine to run
it. The [comparison](./comparison.md) explains how that differs from other
ways to ship a JavaScript program.


Where to start
--------------

Oseo does not implement all the APIs of Node.js, Deno, or the browser. Check
the [supported features](../using/features.md) if you have a program in mind,
or follow the [installation guide](../using/install.md) and try an
[example](../using/examples.md). The [white paper](./white-paper.md) explains
how the compiler preserves dynamic behavior, and the [roadmap](./roadmap.md)
separates completed work from planned features.
