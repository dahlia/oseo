Cryptography integration plan
=============================

Status
------

Implementation status: planned, standards freeze and provider probes not
started. This plan owns the cryptographic runtime boundary used by M6 Web
Crypto and the selected M7 `node:crypto` compatibility surface. It does not
admit either API to an active profile, select a provider, or make a
cryptography library part of the host installation contract before the
required evidence and architecture decisions exist.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-BIGINT.md*](./PLAN-BIGINT.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-M6.md*](./PLAN-M6.md),
[*PLAN-NIO.md*](./PLAN-NIO.md), [*PLAN-PT.md*](./PLAN-PT.md), the frozen
standards and compatibility manifests, and accepted records under
*docs/adr/*. Evidence that changes one of those contracts updates the affected
document in the same change.


Goal
----

Oseo should expose cryptography through one private, provider-independent
runtime boundary. M6 uses that boundary for `crypto.getRandomValues()`,
`crypto.randomUUID()`, and `SubtleCrypto`. M7 may use it for the measured
`node:crypto` surface that is not already covered by Web Crypto.

JavaScript-visible semantics remain Oseo's responsibility. A provider performs
cryptographic primitives and manages opaque key material. It does not choose
algorithm names, parameter validation, key usages, extractability, error
priority, promise scheduling, or Node.js compatibility behavior.

The official distribution should be reproducible and usable offline. Compiling
an Oseo program must not require the user to install OpenSSL, development
headers, `pkg-config`, Perl, Make, Homebrew packages, or a distribution-specific
`libssl-dev` package. A cryptography dependency is a pinned target artifact,
not an ambient host capability.

The boundary must also leave provider replacement possible. OpenSSL is the
leading portable candidate, not a public ABI. A later platform provider or
different portable library should implement the same Oseo-owned operations
without changing generated C, standards behavior, or stable Oseo target names.


Non-goals
---------

Oseo does not implement cryptographic primitives from scratch as part of M6 or
M7. An owned implementation of a primitive requires a separate rationale,
expert review, known-answer and side-channel evidence, and a maintenance plan.

The M6 HTTPS client and trust-store decision remains separate. TLS and Web
Crypto may eventually share a dependency, but selecting one does not select
the other. Certificate-chain building, hostname verification, ALPN, and system
trust discovery remain M6 HTTPS concerns.

This plan does not promise the complete Node.js `crypto` module. M7 selects
operations from package evidence and publishes the exact supported surface.
Node-API, OpenSSL engine configuration, arbitrary provider loading, and
compatibility with undocumented Node.js internals remain outside that claim.

Provider availability does not imply standards support. Oseo may omit an
algorithm that a provider offers, and it must not expose a provider algorithm
through Web Crypto unless the frozen Web Crypto edition and manifest admit it.

FIPS validation is not inferred from an OpenSSL version, static linking, or
provider support. A future FIPS profile needs its own validated module,
configuration, operational policy, target scope, update process, and claim.


Standards and compatibility boundary
------------------------------------

The M6 opening decision freezes the targeted Minimum common web API edition and
web-platform-test revision. Before group 7 begins, a separate cryptography
decision freezes the Web Crypto edition, algorithm matrix, key formats, and
server-runtime deviations against that test revision.
[Web Cryptography Level 2] is currently a working draft, so its latest text is
evidence for a candidate matrix rather than an unversioned moving contract.

The initial Web Crypto candidate matrix contains:

 -  cryptographically secure random bytes and UUID generation;
 -  SHA-1, SHA-256, SHA-384, and SHA-512 digests;
 -  HMAC, HKDF, and PBKDF2;
 -  AES-CTR, AES-CBC, AES-GCM, and AES-KW;
 -  RSASSA-PKCS1-v1\_5, RSA-PSS, and RSA-OAEP;
 -  ECDSA and ECDH with P-256, P-384, and P-521;
 -  Ed25519 and X25519 when the frozen edition includes them; and
 -  raw, SPKI, PKCS8, and JWK key import and export where the selected
    algorithm defines those formats.

This list is not an implementation claim. The frozen matrix records every
operation, key type, format, hash and curve combination, parameter constraint,
and allowed deviation. SHA-1 remains available only where the selected Web
Crypto contract requires it; its presence is not a recommendation for new
protocol design.

M7 freezes a separate `node:crypto` compatibility manifest from measured
package scenarios. The manifest distinguishes:

 -  Web Crypto aliases and shared key conversions;
 -  Node.js one-shot and incremental hash, MAC, cipher, signature, and key
    derivation APIs;
 -  synchronous, callback, promise, and stream-shaped completion behavior;
 -  `KeyObject`, public and private key construction, and serialization;
 -  random bytes, random integers, UUIDs, and timing-safe comparison;
 -  X.509 and certificate utilities selected by package evidence; and
 -  unsupported provider, engine, legacy cipher, or native-addon behavior.

Algorithms added by Node.js outside the frozen Web Crypto matrix, including
new password hashing, SHA-3, KMAC, ChaCha, or post-quantum families, remain
deferred until package evidence justifies them and the selected provider,
target packs, interoperability corpus, and security review cover them.

[Web Cryptography Level 2]: https://www.w3.org/TR/webcrypto-2/


Oseo-owned semantic boundary
----------------------------

The runtime presents an Oseo-owned operation table to the Web Crypto and
`node:crypto` components. Its types describe bytes, validated algorithm
parameters, opaque keys, operation results, and owned failures. No public
OpenSSL, LibreSSL, BoringSSL, CryptoKit, CommonCrypto, Security, `BCrypt`, or
`NCrypt` type crosses this boundary.

Oseo owns:

 -  recognized algorithm names and aliases;
 -  algorithm normalization and dictionary conversion order;
 -  supported key sizes, hashes, curves, IVs, tags, counters, and salt lengths;
 -  `CryptoKey` type, algorithm metadata, usages, and extractability;
 -  strict raw, JWK, SPKI, and PKCS8 validation and canonical export;
 -  Web Crypto exception class and priority;
 -  Node.js error class, code, argument validation, and synchronous throw
    behavior;
 -  buffer snapshot and result construction semantics;
 -  promise, callback, stream, and scheduler handoff;
 -  cancellation and shutdown behavior where the public operation permits it;
    and
 -  key, temporary, and secret-buffer lifetime and zeroization requests.

The adapter records representation conversions that commonly differ between
providers. AES-GCM tag placement, AES-CTR counter length and overflow, ECDSA
raw `r || s` signatures versus DER encoding, RSA-OAEP labels, RSA-PSS salt
length, and provider-specific key import defaults receive explicit tests.

Provider failures are classified before becoming JavaScript values. Oseo must
not expose provider error queues, numeric reason codes, localized messages, or
incidental validation order as its compatibility contract. Unknown provider
failures retain diagnostic detail for developers while returning the owned
public failure selected by the API layer.

Platform callbacks and provider completion threads never call JavaScript
directly. They publish an owned completion to the scheduler, which controls
promise jobs, callbacks, stream events, rejection checkpoints, and shutdown.


Key and secret ownership
------------------------

A `CryptoKey` or Node.js `KeyObject` owns an Oseo wrapper around an opaque
provider handle. The wrapper records public metadata separately and traces
JavaScript references through the normal collector protocol. Provider key
objects and secret buffers are not stored in movable collector memory unless a
future provider contract proves that safe.

Destruction is explicit and deterministic at the native ownership boundary.
Collector reachability may trigger release of an unreachable wrapper, but
cryptographic cleanup must not depend on finalizer ordering for observable
program behavior. Every partial import, generation, derivation, and conversion
path releases provider state when allocation or validation fails.

Zeroization is applied where the selected provider and compiler make a
documented guarantee. The plan does not claim that erasing one buffer erases
all provider temporaries, registers, allocator copies, or swap. Tests verify
the calls and ownership paths that Oseo controls without overstating the
security property.

Production randomness always comes from the accepted provider or operating
system cryptographic random source. Deterministic bytes are available only
through a test adapter that cannot be selected by an ordinary production
build, environment variable, or JavaScript API.


BigInt separation
-----------------

ECMAScript BigInt and cryptographic multiprecision arithmetic are separate
domains. Web Crypto RSA and elliptic-curve operations do not depend on the
representation or arithmetic component selected by
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md).

The cryptography adapter never exposes private key values as
`OSEO_HEAP_BIGINT`, never passes BigInt limbs to a provider, and never reuses
the JavaScript BigInt arithmetic implementation for RSA or curve operations.
JavaScript BigInt semantics require observable normalization, allocation,
collection, and non-constant-time operations that are unsuitable as a
cryptographic key boundary.

JWK integers are decoded from and encoded to their specified byte
representation directly. SPKI and PKCS8 data remain validated binary formats.
If a selected `node:crypto` API exposes a public numeric field, its conversion
uses an explicit public-data path and does not make provider-private material a
JavaScript BigInt.

An external component evaluated for ECMAScript BigInt, such as GMP, is not a
cryptography provider. Conversely, a provider's internal multiprecision
implementation is not a candidate representation for JavaScript BigInt.


Provider candidates
-------------------

Provider selection follows checked-in target probes and an architecture
decision. The decision compares semantic coverage, stable high-level API,
static-link support, target support, security response, release lifetime,
license, redistribution, code size, allocator behavior, global state,
threading, failure isolation, and replacement cost.

### OpenSSL candidate

[OpenSSL 3.5 LTS] is the leading initial portable candidate. The implementation
decision pins an exact patched release, source digest, build configuration, and
accepted support window. It uses the high-level EVP and provider APIs through
an Oseo-owned adapter. OpenSSL 3 releases use the
[Apache License 2.0][OpenSSL license]; the artifact pack carries the required
license and notice material.

The probe uses a private `OSSL_LIB_CTX`, explicitly loads only the providers
the artifact requires, and verifies that the algorithm matrix works without
ambient OpenSSL configuration. Low-level algorithm APIs, ENGINE, the legacy
provider, implicit global defaults, and arbitrary provider discovery are not
part of the candidate contract.

The default provider may be linked statically when the probe proves that every
required implementation is retained and initialized. A later FIPS pack remains
a distinct profile rather than a switch applied to the default pack.

[OpenSSL 3.5 LTS]: https://openssl-library.org/roadmap/index.html
[OpenSSL license]: https://www.openssl-library.org/source/license/index.html

### Other portable candidates

[LibreSSL Portable] supports the current target operating systems and remains a
valid comparison candidate. Its one-year stable-branch update period and API
differences need to provide a measurable benefit over the OpenSSL adapter
before Oseo accepts the additional maintenance and update cadence.

[BoringSSL] is not the default candidate. Its own project documentation does
not recommend general third-party dependency and provides no API or ABI
stability guarantee. A future probe would need a specific advantage, a pinned
source snapshot, and ownership of every update and compatibility change.

[LibreSSL Portable]: https://www.libressl.org/releases.html
[BoringSSL]: https://boringssl.googlesource.com/boringssl/+/HEAD/README.md

### Native platform candidates

A platform-specific provider is acceptable when it implements the same private
operation table and passes the same standards, error, interoperability, and
lifetime corpus. Platform selection must not silently change the advertised
algorithm matrix.

On macOS, a probe must not assume that CryptoKit alone covers the complete
candidate matrix and every key format. It inventories CryptoKit, CommonCrypto,
Security, and `SecKey`, then records any bridge, deployment-target, and
framework-link requirements. A native adapter remains a future size, policy,
or integration candidate rather than the initial assumption.

Windows support receives a separate target decision. A future native adapter
should evaluate CNG through `BCrypt` and `NCrypt`, not make the legacy CryptoAPI
the new design baseline. MSVC, `clang-cl`, MinGW, SDK versions, key storage,
provider policy, and error mapping are separate evidence partitions.


Artifact pack and linking policy
--------------------------------

Official builds consume a content-addressed cryptography artifact pack produced
by release automation. A pack contains:

 -  target-specific public headers and generated configuration;
 -  the exact static cryptography archive and Oseo provider-adapter archive;
 -  dependency version, source URL, source digest, and patch digests;
 -  target, ABI, deployment target, compile flags, and toolchain identity;
 -  enabled providers, algorithms, and configuration options;
 -  archive and header digests;
 -  build and inspection records; and
 -  license, copyright, and NOTICE material required for redistribution.

The Oseo runtime archive, `liboseo_crypto_openssl.a`, and `libcrypto.a` remain
separate inputs. This keeps ownership and binary-size measurements visible and
allows a future provider adapter to replace the OpenSSL archive without
rewriting the language runtime.

The linker receives exact archive paths from the validated pack. It does not
search the host library path for `-lcrypto`, consult `pkg-config`, inherit
Homebrew or system include directories, or accept an ABI-compatible-looking
shared object. Provider headers and the archive come from the same pack.

Initial pack evidence covers `linux-x86_64-gnu` and `macos-aarch64` execution,
plus `linux-aarch64-musl` compile-link and inspection. Each pack proves that
the selected C toolchain can consume its C ABI. Cross-target packs are
downloaded or installed explicitly; the compiler does not pretend a same-host
pack can satisfy another target.

A downstream system-integration profile may intentionally build against a
named system OpenSSL installation. It records the discovered version,
configuration, headers, archive or shared object, and unsupported
reproducibility boundary. It is never an automatic fallback for a missing or
invalid official pack and is not the artifact used for Oseo conformance
results.

The runtime archive reuse key includes the cryptography pack digest, adapter
sources and headers, complete compile and link arguments, target, sanitizer
mode, and observed toolchain identity. Changing a security release or build
configuration invalidates the key.


Toolchain and distribution boundary
-----------------------------------

Cryptography provider choice and C toolchain choice are independent. The
official reference remains the pinned Zig C compiler and linker driver.
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md) owns any system-compiler adapter and its
selection policy; this plan requires only that every supported adapter consume
the same validated pack ABI and enter its identity in the artifact key.

A future system adapter may support same-host GCC or Clang on Linux and Apple
Clang on macOS. The explicit surface may distinguish `zig`, `system`, and
`auto`. Automatic selection may fall back only when the Zig executable cannot
be found or started. A Zig compile or link failure remains a failure and must
not be hidden by retrying an ambient compiler.

The adapter probes compiler version, reported target, archiver and linker,
C11 support, sysroot or SDK, deployment target, libc, sanitizer behavior, and
the bundled cryptography ABI. `linux-aarch64-musl` cross compilation continues
to use Zig unless an explicit cross-compiler adapter supplies equivalent
evidence. Windows uses named MSVC, `clang-cl`, or MinGW adapters rather than a
generic `cc` assumption.

Static cryptography does not prevent a native Oseo compiler from being
distributed as one executable. The compiler does not need to link
cryptography into itself when it only transports a pack as opaque build data.
An official same-target compiler may embed a compressed pack, extract it into
an Oseo-owned content-addressed cache, validate its digest, and pass exact
paths to the toolchain.

That design gives the user one distribution file, not a process that creates
no files. Cross-target packs can remain optional downloads. A compiler that
still emits C also needs a C compiler, linker, target libc, and on macOS an
accepted SDK boundary. M8 removes Node.js and Deno from the trusted compiler
path; it does not by itself remove Zig or other external native build tools.


Security updates and operational policy
---------------------------------------

Static linking transfers update responsibility to Oseo releases. The selected
provider version and pack digest are recorded in produced artifacts so users
can identify affected executables. A provider security update rebuilds target
packs, invalidates compiler caches, reruns the complete cryptography corpus,
and triggers an Oseo release or documented rebuild advisory according to the
accepted response policy.

The repository records how maintainers monitor upstream advisories, which
severity and applicability findings require a release, and how rejected
findings are justified. Reproducible pinning must not become an excuse to ship
known-vulnerable code after an update is available.

Operating-system policy must not silently add, remove, or substitute algorithms
inside the claimed Web Crypto matrix. A capability failure becomes an owned
startup, compile, or operation error according to the selected boundary. A
separate restricted or FIPS profile publishes its different matrix and
configuration explicitly.

Provider initialization is bounded and context-owned. Configuration file
lookup, environment-selected providers, mutable process-global defaults, and
network access are disabled unless a later decision admits a specific use.
Initialization and teardown are covered across multiple independent Oseo
contexts in one process.


Evidence and testing
--------------------

The first implementation checks in an operation-by-operation conformance
matrix linking the frozen Web Crypto edition, selected web-platform tests,
provider calls, adapter conversions, and current result. The M7 matrix links
each admitted `node:crypto` export to public Node.js behavior and at least one
measured package scenario.

Fixed and generated tests cover:

 -  published known-answer vectors for every deterministic primitive;
 -  round trips and cross-provider import, export, sign, verify, encrypt,
    decrypt, wrap, unwrap, derive, and serialization behavior;
 -  malformed JWK, DER, SPKI, PKCS8, points, signatures, tags, IVs, counters,
    lengths, usages, and extractability combinations;
 -  validation, conversion, and exception priority with observable inputs;
 -  randomized operations through invariant and interoperability checks rather
    than byte equality;
 -  allocation failure, partial initialization, cancellation, and teardown;
 -  collector pressure around wrappers and asynchronous completions;
 -  multiple contexts, concurrent operations, and provider error isolation;
 -  production-randomness rejection of the deterministic test adapter; and
 -  strict warnings, sanitizers, dual-target execution, and cross-target
    compile-link inspection.

Differential tests compare conforming Web Crypto behavior with the pinned
Node.js and Deno references where their selected editions overlap. Node.js
compatibility tests compare the pinned Node.js release named by M7. Reference
disagreement is retained as infrastructure or standards-version evidence, not
silently resolved in favor of one host.

The pack pipeline is tested offline from pinned source inputs. It verifies
archive membership, exported symbols, forbidden dynamic dependencies, provider
initialization, license payload, deterministic metadata, cache relocation,
concurrent extraction, corrupted-pack rejection, and rebuild behavior after a
dependency digest changes.

Measurements record pack size, linked executable size per algorithm family,
dead-stripping behavior, compiler startup, cold and warm extraction, compile
and link time, operation latency, and peak native memory. The system-compiler
matrix is additional portability evidence until an accepted target record
makes one of those adapters part of the supported toolchain set.


Delivery order
--------------

1.  After the M6 opening decision freezes the web-platform-test revision,
    accept a cryptography standards decision that freezes the Web Crypto
    edition, algorithm matrix, key formats, and server-runtime deviations
    against it.
2.  Define the private operation table, owned error taxonomy, key and secret
    lifetime, scheduler handoff, and deterministic test adapter.
3.  Check in OpenSSL, LibreSSL, and relevant platform-provider probes on the
    configured target roles, retaining rejected evidence.
4.  Accept an architecture decision for the initial provider, exact version,
    adapter surface, static-link policy, target scope, update process, and
    replacement triggers.
5.  Build and validate content-addressed target packs, offline release tasks,
    notices, cache keys, and compiler consumption through exact paths.
6.  Implement randomness, UUIDs, digest, symmetric algorithms, derivation,
    asymmetric algorithms, key formats, and `CryptoKey` semantics in matrix
    units.
7.  Close the Web Crypto web-platform-test matrix, collector and scheduler
    evidence, native target gates, packaging measurements, and M6 profile.
8.  Freeze the selected `node:crypto` surface from package evidence, reusing
    Web Crypto operations where their public behavior agrees.
9.  Add Node.js validation, errors, completion forms, `KeyObject`, incremental
    state, serialization, and any separately justified algorithms as measured
    units.
10. Close the M7 compatibility matrix and package scenarios without promoting
    unimplemented exports.

Each checkpoint updates the active standards or compatibility manifest,
runtime ABI version, pack schema, package documentation, security inventory,
and affected living design documents in the same change.


Exit criteria
-------------

The M6 part of this plan is complete only when:

 -  one frozen Web Crypto edition and algorithm matrix define the claim;
 -  every admitted operation, parameter combination, key format, and error
    path passes the applicable pinned web-platform tests;
 -  one accepted provider decision records version, license, source and build
    digests, target scope, update policy, replacement boundary, and FIPS
    non-claim;
 -  official compilation uses validated target packs and never requires or
    automatically discovers a host OpenSSL installation;
 -  opaque keys, secrets, asynchronous completions, collection, failure, and
    teardown satisfy the owned lifetime contract;
 -  known-answer, malformed-input, differential, interoperability, property,
    sanitizer, target, offline-packaging, and cache evidence passes;
 -  provider and pack identity are recoverable from produced artifacts; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout within the published gate budgets.

The M7 part is complete only when its separate manifest names every supported
`node:crypto` export and behavior, the selected package corpus passes, Node.js
errors and completion forms have fixed evidence, and unavailable exports fail
honestly. Completing M6 does not imply complete `node:crypto` compatibility,
and completing the selected M7 surface does not widen the Web Crypto claim.
