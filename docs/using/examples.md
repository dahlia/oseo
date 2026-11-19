Examples
========

Build and run the example
-------------------------

After [installing Oseo](./install.md), save this program as *hello.ts* in a
directory of your choice:

~~~~ typescript
const message: string = "Hello, Oseo!";
console.log(message);
~~~~

From that directory, compile the program and run it:

~~~~ sh
oseo build hello.ts -o hello
./hello
~~~~

~~~~ text
Hello, Oseo!
~~~~

`oseo build` leaves the executable at *hello* without starting it. The
executable runs without Node.js or Zig. To compile and run in one step
without retaining the executable, use `oseo run hello.ts`. The
[CLI reference](./cli.md) also covers intermediate representation and C output.


Read standard input and program arguments
-----------------------------------------

Open the [numeric demo] on GitHub and save the raw file as
*numeric-hinted.ts*. It reads a JSON array of pairs from standard input
and adds each pair. The argument `1` specifies one pass through the array.

~~~~ sh
oseo build numeric-hinted.ts -o numeric
printf '[[20,22]]\n' | ./numeric 1
~~~~

~~~~ json
{"iterations":1,"results":[42]}
~~~~

The [examples directory] also contains variants of the numeric demo with no
annotations or with deliberately wrong annotations, a line matcher, and a
small ray tracer.

[numeric demo]: ../../examples/numeric-hinted.ts
[examples directory]: ../../examples/
