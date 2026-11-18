Supported features
==================

Oseo compiles source ahead of time. TypeScript annotations and JSDoc types
can select specialized code paths, but they do not require a value to have
the annotated type. If a runtime guard fails, execution continues in
already-compiled generic code. Oseo does not type-check source, and it does
not accept every TypeScript construct.

The measured profile includes primitives, objects, arrays, closures,
exceptions, statically resolved module graphs, promises, asynchronous
execution, and timers. Consult the repository's
[ECMAScript 2026 language profile] for the accepted forms, coverage evidence,
and deferrals, including the Annex B boundary. This is a measured subset,
not a claim of conformance to an edition of ECMAScript.

Oseo is not a drop-in Node.js or browser runtime. It implements a small
[program input and exit status subset](../cli.md#program-input-and-exit-status),
not the full Node.js or Web APIs. Oseo cannot compile arbitrary runtime source
strings. Dynamic `import()` is limited to a string literal whose target can
be resolved while building. The [module entry section](../cli.md#module-entries)
describes entry selection and import resolution.

Linux AMD64 and macOS AArch64 are supported native execution hosts. Linux
AArch64 is a compile-link and inspection target, not a supported native
execution host.

[ECMAScript 2026 language profile]: https://github.com/dahlia/oseo/blob/main/docs/language-profile-es2026.md
