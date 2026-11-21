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

Open the [line matcher] on GitHub and save the raw file as *line-match.ts*.
Build it, then pass a regular expression as the first argument and pipe
two lines into standard input. The `DEMO_LABEL` environment variable
sets the label in the output.

~~~~ sh
oseo build line-match.ts -o line-match
printf '서울\n도쿄\n' | DEMO_LABEL=travel ./line-match '도쿄'
~~~~

~~~~ json
{"label":"travel","lines":2,"matches":[{"line":2,"text":"도쿄"}]}
~~~~

The [examples directory] also contains a small ray tracer and a numeric
demo with annotated, unannotated, and deliberately misannotated variants.

[line matcher]: ../../examples/line-match.ts
[examples directory]: ../../examples/
