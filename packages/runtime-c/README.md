@oseo/runtime-c
===============

`@oseo/runtime-c` supplies the C11 source and headers that Oseo links with
its generated C. The runtime implements JavaScript values, objects, garbage
collection, and the event loop for Oseo's [supported language profile].
Both npm and JSR ship the native assets as source files, not as a compiled
library.

To compile or run a JavaScript or TypeScript program, use the [Oseo CLI].
It selects the runtime inputs for you. This package does not run JavaScript
on its own or provide a stable C embedding API.

In an Oseo integration, `cRuntimeProvider.getRuntimeInput()` returns the
runtime ABI identifier and the ordered list of asset names, kinds, and URLs.
Use matching compiler, C backend, and runtime package versions. Generated C
includes `oseo_runtime.h`; `runtime_internal.h` is private to the runtime.
See the [runtime ABI history] for changes to that boundary.

The TypeScript provider is licensed under GPL-3.0-or-later. Oseo-authored
native code is MIT-licensed, and Unicode-derived data retains its own terms.
When redistributing an executable linked with the runtime, include
`MIT-LICENSE.txt` and `UNICODE-LICENSE.txt` from the package, along with
any applicable [third-party notices].

[supported language profile]: https://github.com/dahlia/oseo/blob/main/docs/using/features.md
[Oseo CLI]: https://github.com/dahlia/oseo/blob/main/docs/using/install.md
[runtime ABI history]: https://github.com/dahlia/oseo/blob/main/docs/development/package-runtime-c.md
[third-party notices]: https://github.com/dahlia/oseo/blob/main/docs/runtime-support-surface.md#output-and-registry-notices
