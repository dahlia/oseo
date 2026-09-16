Host C sanitizer toolchain
==========================

`createHostCcToolchain` plans host-only Clang or GCC sanitizer builds.
The caller selects and verifies the compiler before constructing the adapter.
Zig remains the default Oseo toolchain.
