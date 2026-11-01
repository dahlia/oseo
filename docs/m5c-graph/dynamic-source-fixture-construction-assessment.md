Dynamic source fixture-construction per-path assessment
=======================================================

This assessment covers exactly the 15-path selector of
`dynamic-source-fixture-construction-evidence`. Source digests are the
exclusion audit's SHA-256 of the pinned upstream file, and observation
digests are its normalized observation digests; both match the existing
audit rows. Accounting changes no observation or dependency tag and counts
no path as pass.

Fourteen paths close under ADR 0016: the 11 compound assignment rows with a
new native witness, and the three direct eval spread rows under the existing
`eval-semantics` assessment. One path is deferred under ADR 0031.


Compound assignment reference base (11, closed)
-----------------------------------------------

*S11.13.2\_A6.1\_T1* through *S11.13.2\_A6.11\_T1* share one body,
differing only in operator and values:

~~~~ javascript
var x = INITIAL;
var innerX = (function() {
  x OP= (eval("var x = 2;"), OPERAND);
  return x;
})();
// innerX === 2 and x === EXPECTED
~~~~

The contract is that the reference to `x` is resolved before the right
operand runs and that PutValue writes through that reference, so the outer
`x` receives `INITIAL OP OPERAND` and the new, more local `x` keeps 2.
The direct eval only creates the more local binding at that point.

The witness in
[*compound-reference-base.ts*](../../tests/native/fixtures/compound-reference-base.ts)
replaces the eval declaration with a sloppy `with` object that gains `x` during
the right operand, `x OP= (scope.x = 2, OPERAND)`, inside the same nested
function. The reference base is still the outer function's declarative
environment record, as the originals' descriptions require. `check(innerX, 2)`
and `check(x, EXPECTED)` are the two original assertions with strict value and
type comparison, and `check(scope.x, 2)` confirms that PutValue left the newer
binding alone.
[*compound-reference-base-source.test.ts*](../../tests/compound-reference-base-source.test.ts)
re-derives every operator, initial value, operand and expected result from the
pinned sources by comparing the whole original body.

Each row has two mutations that must be rejected by that realm's
`Test262Error`, a verdict independent of `check`: adding `scope.x` before
the compound assignment, so the reference names it, and never adding it.
[*compound-reference-base-evidence.test.ts*](../../tests/compound-reference-base-evidence.test.ts)
runs the witnesses and mutants natively with both specialization policies and a
collection at every safepoint.

Node.js and Deno are not references for this witness. V8 resolves the
`with` reference again at PutValue and writes `scope.x`, which is the
same divergence the passing plain assignment path
*assignment/S11.13.1\_A6\_T3.js* exposes. JavaScriptCore (Bun 1.4.4)
observes the specified `innerX === 2` and `x === 12` for the first row.


Direct eval with spread arguments (3, closed)
---------------------------------------------

*call/eval-spread.js*, *eval-spread-empty-leading.js* and
*eval-spread-empty-trailing.js* assert two things: that a direct eval call
with spread arguments evaluates its first argument as source in the caller's
environment (`x` becomes 1 or 0 locally and the global `x` is untouched),
and that the spread iterator's `next` runs the expected number of times
(3, 1 and 1).

The first is source evaluation itself, the direct eval argument selection of
the function call evaluation steps and a binding written by eval code. The
existing `eval-semantics` assessment covers it unchanged: its reason names
direct evaluation and binding lookup from eval code, and ADR 0016 excludes
`eval` in call position. No ADR text changes.

The second is ordinary ArgumentListEvaluation, already witnessed by passing
static paths: *call/spread-sngl-iter.js* and *call/spread-mult-iter.js*
consume a user iterator in call arguments and check the resulting argument
list, and *call/eval-spread-empty.js* passes with the same direct eval callee
and an empty spread, `nextCount === 1`. All three rows move to ADR 0016.


Global lexical over an eval var (1, deferred)
---------------------------------------------

*global-code/script-decl-lex-var-declared-via-eval.js* declares
`var test262Var` and `function test262Fn` through global direct eval, then
declares `let test262Var` and `const test262Fn` in later host Scripts and
reads 1 and 2. In non-strict code the subject is GlobalDeclarationInstantiation
step 3: a lexical name may shadow an existing global var or function only if
its property is configurable, and only non-strict direct eval creates
configurable var and function bindings. In strict code, eval keeps its
declarations in its own variable environment, which is eval semantics.

No witness reproduces the non-strict observation:

 -  The literal host Script track declares the var in one Script and the
    lexical in the next. A Script var or function is non-configurable, so
    the next Script throws SyntaxError, the opposite outcome; the passing
    *global-code/script-decl-lex-var.js* asserts exactly that.
 -  A configurable global property made by assignment or
    `Object.defineProperty` is shadowed without error, as the passing
    *global-code/decl-lex-configurable-global.js* shows, but it is not a
    declared var or function binding and does not test eval's declaration
    instantiation.
 -  Deleting a declared global var to make room is impossible, since the
    declaration is non-configurable.

The path is deferred to *PLAN-DYN.md* in the `run-time-source` family under
the new `global-eval-var-configurability` audit assessment.


Digests
-------

| Path                                                     | Source SHA256                                                      | Observation SHA256                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| *expressions/call/eval-spread-empty-leading.js*          | `cf5223e3010a7abea82fe7f0b24c8b2746fce1bcabdd27b1777382fd5afd8b38` | `47fc891b37ccc2b46ee8d0c62dd2c644bd5f8690cae556d5bb9e98faa8838d29` |
| *expressions/call/eval-spread-empty-trailing.js*         | `2b450001e579ddec3ce1a038c0616895b08946a48a515bde58ac1e4208ebc4d0` | `b85bb786b97e30b78b6a8bb4ae48452109cb154c2a8fbb2ffec6c316d0d215a3` |
| *expressions/call/eval-spread.js*                        | `00323d72969c804b8093dbe36a8772af23c57d881ca9621f639edf15849af028` | `53f8092413b16744536e8efeb28a74dcf840662294aebd821bf98ebd908d9bd6` |
| *expressions/compound-assignment/S11.13.2\_A6.10\_T1.js* | `663688921461b65df33e93fbe4c6af84324ed50487b0c2220deea12cf1513fe2` | `c1de1a522eaf3be020995cabe0e5ac0b583d95582c7f6692265219c8be81a028` |
| *expressions/compound-assignment/S11.13.2\_A6.11\_T1.js* | `716d02217c839a73f8fae9f516a07401a37146e22715c53e8d17e69293bbc68b` | `316c862576f1cea8ec5c6fad97cc122f33580915659dec1e806c7ccab837bc77` |
| *expressions/compound-assignment/S11.13.2\_A6.1\_T1.js*  | `a553b08e009170f0263cc1f88541adef2f78e15852e2961950ef9c57de777948` | `d28601bed5f97e0af714572ae19c12ef6b2c66437aba176a62dcbe6b1fca8482` |
| *expressions/compound-assignment/S11.13.2\_A6.2\_T1.js*  | `15e1a7f12297c0b524719fb4ba6fc5e78ae4d6b5e3c7825a06506864c9a06afa` | `a2d7b10f9342959509c126c4f08c2db67330ca50515568f359caa8dc7c1c352d` |
| *expressions/compound-assignment/S11.13.2\_A6.3\_T1.js*  | `632eb4b76bb421667c2301157d704d7cac4029d40a084050fc7deb7a59f5a053` | `7c063e4bb18c5531cb1c299e18f245f85229946fef6810bc68aa716c02935b8a` |
| *expressions/compound-assignment/S11.13.2\_A6.4\_T1.js*  | `a2bc57d8ce94b0880de3d88464ba904ebe5080ffa30cc1b3e3844917bbb1cc67` | `bcfd8d2c0fb0f734367c9bc0d3ace4c929cfb25964f9ac46196d015494872cb8` |
| *expressions/compound-assignment/S11.13.2\_A6.5\_T1.js*  | `fbc32293d12565925bf001a235bc3f2f3f62cc733c14eb12bde9d9af60d11e05` | `f37654b4570173381324a4d28ffa411a0ce94274fcdbae4fc6ff7bd2864866c8` |
| *expressions/compound-assignment/S11.13.2\_A6.6\_T1.js*  | `8a827e48c5cacb17e9992be069f908b885c7c718d5a4300bd5dd323aba2e200a` | `fc4516c6eaf0b9583709d987935bb869ffa0f59364643e2084793ef89792c8de` |
| *expressions/compound-assignment/S11.13.2\_A6.7\_T1.js*  | `50a317b028f229eaa99e01102e43f372939b6732cbf096c9719822626763d504` | `fa431ff9db6104c0fffeed6224b641e245dc05525a1ad279f5afd88e542cbbec` |
| *expressions/compound-assignment/S11.13.2\_A6.8\_T1.js*  | `e4caed881462b4903e856c0f03b8c032c5c1d8f8000814ceaf24b3367ea4f743` | `41698c08088c9482888ceb1c3d613af299a85b28b0de9350dc453a4ac927037e` |
| *expressions/compound-assignment/S11.13.2\_A6.9\_T1.js*  | `0c8c65e0d65110166ea3705ff5fa1365a0d4025ca8b6784befe4cc84a045e889` | `8e54e61c7709e1285f2e2fce4e20c864335d0a536a6fadcb95d16c168857b931` |
| *global-code/script-decl-lex-var-declared-via-eval.js*   | `ce9644b3e5a41836f50e358710331e62782ddab5d3f29481d79acfa00393352c` | `3a99f9aabc2dbdd31f3cffb4544dfa3dbb8e0f4598c3bfb8249045dc78cccb2c` |

Supporting passing paths cited above:

| Path                                          | Source SHA256                                                      | Observation SHA256                                                 |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| *expressions/call/eval-spread-empty.js*       | `9579caf22073a998b319be2aca4398330e6b13cfd807f89318f84c06905a9294` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
| *expressions/call/spread-sngl-iter.js*        | `6c16e0a7a5b63477dc43c893ee0ef50449b0092b2c209953ac9a57d1e8d3f42a` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
| *expressions/call/spread-mult-iter.js*        | `4da06adda59273d76828dc694c68fe23c04734528287f4651de5622ad2fe36f2` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
| *expressions/assignment/S11.13.1\_A6\_T3.js*  | `9d8da34aa6fe0f24e9c5a4df1aedf1e7ac3de694a69f385fd0cf2ba7bbfbf1da` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
| *global-code/script-decl-lex-var.js*          | `800b58a1e21e17e02de259c52d075bde3bb84fec0bab2cd703b4ca74b6392ff0` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
| *global-code/decl-lex-configurable-global.js* | `58715d3927cb0ad6c52237ae01d562e9955032270d76c8430a68020129ec7486` | `11c11db30f4b3f6c758722ba3e27eea08145b7d212f6a157451e364b48475280` |
