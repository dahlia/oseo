/** A fixed call-target regression, independent of the generator. */
export interface RuntimeOwnedScriptFixture {
  readonly name: string;
  readonly source: string;
  readonly expected: string;
}

// A separate realm keeps the reference host's print bridge independent from
// the subject's console binding, without changing any original observer.
const prefix = `const output = $262.createRealm().global.print;\n`;
const suffix = `
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
output(add('x', 'y'));
`;

/** Private intrinsics and later user bindings must share call order. */
export const runtimeOwnedScriptFixtures: readonly RuntimeOwnedScriptFixture[] =
  [
    {
      name: "console var function and lexical declarations",
      source:
        prefix +
        `
$262.evalScript(
  'var console = { log: function(v) { globalThis.seen = ' +
  'v; } };'
);
console.log('var'); output(globalThis.seen);
$262.evalScript(
  'function console() {} console.log = function(v) { ' +
  'globalThis.seen = v; };'
);
console.log('function'); output(globalThis.seen);
const other = $262.createRealm();
other.evalScript(
  'let console = { log: function(v) { globalThis.seen = ' +
  'v; } };'
);
other.evalScript('console.log("lexical");');
output(other.global.seen);
` +
        suffix,
      expected: "var\nfunction\nlexical\nxy\n",
    },
    {
      name: "same-source local bindings and with overrides",
      source:
        prefix +
        `
$262.evalScript(
  'var console = { log: function(v) { globalThis.seen = v; } }; ' +
  'function setTimeout(v) { return v + 100; }'
);
function declared() {
  const console = { log: function(v) { globalThis.local = v; } };
  function setTimeout(v) { return v + 1; }
  const scope = {
    console: { log: function(v) { globalThis.scoped = v; } },
    setTimeout: function(v) { 'use strict'; return this === scope ? v : 0; },
    [Symbol.unscopables]: { console: false, setTimeout: false }
  };
  with (scope) { console.log('scope'); output(setTimeout(2)); }
  scope[Symbol.unscopables].console = true;
  scope[Symbol.unscopables].setTimeout = true;
  with (scope) { console.log('local'); output(setTimeout(2)); }
}
declared();
console.log('global'); output(setTimeout(2));
output(globalThis.scoped); output(globalThis.local); output(globalThis.seen);
` +
        suffix,
      expected: "2\n3\n102\nscope\nlocal\nglobal\nxy\n",
    },
    {
      name: "timer var function forwarding and tail calls",
      source:
        prefix +
        `
$262.evalScript(
  'var setTimeout = function(f, v) { return f(v); }; var ' +
  'clearTimeout = function(v) { globalThis.cleared = v; ' +
  'return "cleared"; };'
);
output(setTimeout(function(v) { return v + 1; }, 4));
output(clearTimeout(9)); output(globalThis.cleared);
$262.evalScript(
  '"use strict"; function setTimeout(n) { if (n === 0) ' +
  'return "tail"; return setTimeout(n - 1); } function ' +
  'clearTimeout(v) { return v + 1; }'
);
function forward(n) { 'use strict'; return setTimeout(n); }
output(forward(256));
const bound = globalThis.clearTimeout.bind(null);
const proxy = new Proxy(bound, {
  apply: function(target, receiver, args) {
    return Reflect.apply(target, receiver, args);
  }
});
output(proxy(8));
` +
        suffix,
      expected: "5\ncleared\n9\ntail\n9\nxy\n",
    },
    {
      name: "callee receiver and getter precede argument effects",
      source:
        prefix +
        `
$262.evalScript(
  'var console = { id: "old", get log() { ' +
  'globalThis.trace = "get;"; return function(v) { ' +
  'globalThis.trace += this.id + ":" + v; }; } };'
);
console.log($262.evalScript(
  'globalThis.trace += "arg;"; globalThis.console = { ' +
  'id: "new", log: function() { globalThis.trace = ' +
  '"wrong"; } }; "value";'
));
output(globalThis.trace);
` +
        suffix,
      expected: "get;arg;old:value\nxy\n",
    },
    {
      name: "initial miss preserves intrinsic selection",
      source:
        prefix +
        `
if (false) $262.evalScript('var console = { log: function() {} };');
console.log($262.evalScript(
  'var console = { log: function() { globalThis.called = ' +
  'true; } }; "before";'
));
output(globalThis.called === undefined);
console.log(); output(globalThis.called);
` +
        suffix,
      expected: "before\ntrue\ntrue\nxy\n",
    },
    {
      name: "noncallable and abrupt values never fall back",
      source:
        prefix +
        `
globalThis.effects = 0;
$262.evalScript(
  'var console = { log: 17 }; var setTimeout = ' +
  'undefined; var clearTimeout = 0;'
);
try { console.log(++globalThis.effects); }
catch (error) { output(error instanceof TypeError); }
try { setTimeout(++globalThis.effects); }
catch (error) { output(error instanceof TypeError); }
try { clearTimeout(++globalThis.effects); }
catch (error) { output(error instanceof TypeError); }
output(globalThis.effects);
globalThis.token = {};
$262.evalScript(
  'globalThis.console = { get log() { throw ' +
  'globalThis.token; } };'
);
try { console.log(++globalThis.effects); }
catch (error) { output(error === globalThis.token); }
output(globalThis.effects);
` +
        suffix,
      expected: "true\ntrue\ntrue\n3\ntrue\n3\nxy\n",
    },
    {
      name: "foreign Script call targets retain their realm",
      source:
        prefix +
        `
const other = $262.createRealm();
other.evalScript(
  'var console = { log: function(v) { globalThis.seen = ' +
  'v; } }; function setTimeout(v) { globalThis.timer = ' +
  'v; return "foreign"; }'
);
other.evalScript(
  'function run() { console.log("other"); return ' +
  'setTimeout(7); }'
);
output(other.global.run()); output(other.global.seen);
output(other.global.timer);
console.log('main');
` +
        suffix,
      expected: "foreign\nother\n7\nmain\nxy\n",
    },
    {
      name: "with receivers unscopables and disappearing bindings",
      source:
        prefix +
        `
$262.evalScript(
  'var console = { log: function(v) { globalThis.seen = ' +
  '"global" + v; } }; function setTimeout() { return ' +
  '"global"; }'
);
const scope = {
  console: { tag: 'scope',
    log: function(v) { globalThis.seen = this.tag + v; } },
  setTimeout: function(v) { 'use strict'; return this === scope ? v + 10 : 0; },
  [Symbol.unscopables]: { console: false, setTimeout: false }
};
with (scope) { console.log('x'); output(setTimeout(2)); }
output(globalThis.seen);
scope[Symbol.unscopables].console = true;
scope[Symbol.unscopables].setTimeout = true;
with (scope) { console.log('y'); output(setTimeout(3)); }
output(globalThis.seen);
let hasCount = 0; let effects = 0;
const changing = new Proxy({ setTimeout: function() {} }, {
  has: function(target, key) {
    if (key === 'setTimeout') ++hasCount;
    return Reflect.has(target, key);
  },
  get: function(target, key) {
    if (key === 'setTimeout') { delete target[key]; return undefined; }
    return Reflect.get(target, key);
  }
});
with (changing) {
  try { setTimeout(++effects); }
  catch (error) { output(error instanceof TypeError); }
}
output(hasCount > 0); output(effects);
` +
        suffix,
      expected: "12\nscopex\nglobal\nglobaly\ntrue\ntrue\n1\nxy\n",
    },
  ];
