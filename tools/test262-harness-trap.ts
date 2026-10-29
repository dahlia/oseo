import { randomBytes } from "node:crypto";

/**
 * Prefix of the line an armed trap prints when a case observes an
 * omitted harness member. The run's token and the member follow it.
 */
export const harnessTrapMarker = "Test262:HarnessTrap:";

/** Prefix of the line the installer prints once every trap is armed. */
export const harnessArmedMarker = "Test262:HarnessArmed:";

/**
 * A fresh secret for one case. The installer embeds it only in its own
 * closure, which no case code can reach, so a case that prints marker
 * text cannot produce a line carrying it.
 */
export function harnessTrapToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Script text that replaces each named global harness object with a proxy
 * that traps every observation of its omitted members.
 *
 * The installer runs after the reviewed includes and before any statement
 * of the case. Only hoisted declarations of the case exist by then, and
 * those can rebind a global name but cannot run code, so every intrinsic
 * property the installer reads is still unmodified. A rebound `Proxy`,
 * `TypeError`, or `Reflect` method is an ordinary function whose source
 * text cannot read as native code, so the installer then returns without
 * arming. It captures every function it later calls, so nothing a case
 * replaces afterwards reaches the traps. The handler and the omitted-key
 * table have no prototype, so inherited properties can neither add a trap
 * nor hide a key. Descriptors pass between the proxy and the reviewed
 * object as prototype-free copies of their own fields, because the proxy
 * converts each one again where an ordinary object would not, and an
 * inherited field such as `get` must not reach that conversion.
 *
 * The admitted profile compiles `console.log` as a direct call to the
 * runtime's output intrinsic unless a declaration binds `console`, and a
 * Script-level binding of `console` makes the arming call throw before it
 * prints. A case built with the test262 host reads `console` from the
 * global object instead, so the runner never installs a trap there.
 *
 * A trap prints its marker before it throws, so a case that catches the
 * throw or completes in any way still leaves the marker in standard
 * output. Reading, writing, describing, defining, deleting, or testing an
 * omitted key traps, and so does listing the object's own keys, because
 * the upstream list includes every omitted member. Kept and unknown keys
 * forward unchanged to the reviewed object.
 */
export function harnessTrapSource(
  objects: ReadonlyMap<string, ReadonlySet<string>>,
  token: string,
): string {
  const installs = [...objects]
    .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(
      ([name, keys]) =>
        `  ${name} = install(${name}, ${JSON.stringify(name)}, ` +
        `${JSON.stringify([...keys].toSorted())});\n`,
    )
    .join("");
  return (
    "void function () {\n" +
    "  var text = (function () {}).toString;\n" +
    "  var create = ({}).constructor.create;\n" +
    "  var ProxyConstructor = Proxy;\n" +
    "  var TypeErrorConstructor = TypeError;\n" +
    "  var reflect = Reflect;\n" +
    "  var get = reflect.get;\n" +
    "  var set = reflect.set;\n" +
    "  var has = reflect.has;\n" +
    "  var describe = reflect.getOwnPropertyDescriptor;\n" +
    "  var define = reflect.defineProperty;\n" +
    "  var remove = reflect.deleteProperty;\n" +
    "  function native(value, name) {\n" +
    '    return typeof value === "function" &&\n' +
    "      text.call(value) ===\n" +
    '        "function " + name + "() { [native code] }";\n' +
    "  }\n" +
    '  if (!(native(ProxyConstructor, "Proxy") &&\n' +
    '      native(TypeErrorConstructor, "TypeError") &&\n' +
    '      native(get, "get") && native(set, "set") &&\n' +
    '      native(has, "has") &&\n' +
    '      native(describe, "getOwnPropertyDescriptor") &&\n' +
    '      native(define, "defineProperty") &&\n' +
    '      native(remove, "deleteProperty"))) {\n' +
    "    return;\n" +
    "  }\n" +
    `  var marker = ${JSON.stringify(`${harnessTrapMarker}${token}:`)};\n` +
    "  function trap(member) {\n" +
    "    console.log(marker + member);\n" +
    "    throw new TypeErrorConstructor(\n" +
    '      "The reviewed harness omits " + member + ".");\n' +
    "  }\n" +
    '  var fields = ["value", "writable", "get", "set", "enumerable",\n' +
    '    "configurable"];\n' +
    "  function own(descriptor) {\n" +
    "    if (descriptor === undefined) return undefined;\n" +
    "    var copy = create(null);\n" +
    "    for (var index = 0; index < fields.length; index += 1) {\n" +
    "      var field = fields[index];\n" +
    "      if (describe(descriptor, field) !== undefined) {\n" +
    "        copy[field] = descriptor[field];\n" +
    "      }\n" +
    "    }\n" +
    "    return copy;\n" +
    "  }\n" +
    "  function install(target, name, keys) {\n" +
    "    var omitted = create(null);\n" +
    "    for (var index = 0; index < keys.length; index += 1) {\n" +
    "      omitted[keys[index]] = true;\n" +
    "    }\n" +
    "    function check(key) {\n" +
    '      if (omitted[key] === true) trap(name + "." + key);\n' +
    "    }\n" +
    "    var handler = create(null);\n" +
    "    handler.get = function (object, key, receiver) {\n" +
    "      check(key);\n" +
    "      return get(object, key, receiver);\n" +
    "    };\n" +
    "    handler.set = function (object, key, value, receiver) {\n" +
    "      check(key);\n" +
    "      return set(object, key, value, receiver);\n" +
    "    };\n" +
    "    handler.has = function (object, key) {\n" +
    "      check(key);\n" +
    "      return has(object, key);\n" +
    "    };\n" +
    "    handler.getOwnPropertyDescriptor = function (object, key) {\n" +
    "      check(key);\n" +
    "      return own(describe(object, key));\n" +
    "    };\n" +
    "    handler.defineProperty = function (object, key, descriptor) {\n" +
    "      check(key);\n" +
    "      return define(object, key, own(descriptor));\n" +
    "    };\n" +
    "    handler.deleteProperty = function (object, key) {\n" +
    "      check(key);\n" +
    "      return remove(object, key);\n" +
    "    };\n" +
    "    handler.ownKeys = function () {\n" +
    '      trap(name + " own keys");\n' +
    "    };\n" +
    "    return new ProxyConstructor(target, handler);\n" +
    "  }\n" +
    installs +
    `  console.log(${JSON.stringify(`${harnessArmedMarker}${token}`)});\n` +
    "}();"
  );
}

/** What one executed variant's output shows about the installed traps. */
export type HarnessTrapOutcome =
  | { readonly kind: "trapped"; readonly member: string }
  | { readonly kind: "unarmed" };

/**
 * Read the trap outcome of one variant from its standard output. A marker
 * line counts only when it carries this case's token, which no case code
 * can know, so a forged line is ordinary program output. The trap is
 * looked for anywhere in the output, because a case may print text
 * without a line break before triggering it. A started program that
 * printed no armed line ran without traps, whatever else it did. Pass
 * `started` false when the program may not have started, such as a
 * compile rejection or a host failure; then only a trap counts.
 */
export function harnessTrapOutcome(
  stdout: string,
  token: string,
  started: boolean,
): HarnessTrapOutcome | undefined {
  const marker = `${harnessTrapMarker}${token}:`;
  const index = stdout.indexOf(marker);
  if (index >= 0) {
    const rest = stdout.slice(index + marker.length);
    const end = rest.indexOf("\n");
    return { kind: "trapped", member: end < 0 ? rest : rest.slice(0, end) };
  }
  if (started && !stdout.includes(`${harnessArmedMarker}${token}\n`)) {
    return { kind: "unarmed" };
  }
  return undefined;
}
