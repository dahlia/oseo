Oseo changelog
==============

Version 0.1.0
-------------

Released on November 22, 2026.

 -  Oseo's first release compiles a subset of JavaScript and accepts erasable
    TypeScript syntax. It emits C11, and `oseo build` uses Zig to produce a
    native executable that runs without Node.js or Zig.
 -  The standalone CLI includes Node.js and runs on Linux AMD64 (GNU) and
    macOS on Apple Silicon. By default, it downloads and verifies Zig on the
    first native build. You can also install the CLI from npm or use the
    packages from JSR in Deno. See the [installation guide].
 -  Try the numeric demo, line matcher, or small ray tracer. The line matcher
    uses the supported subset of Node.js APIs for program arguments,
    environment variables, and standard input. See the [examples] and
    [supported features].

[installation guide]: https://oseo.dev/using/install
[examples]: https://oseo.dev/using/examples
[supported features]: https://oseo.dev/using/features
