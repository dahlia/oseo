export const log = [];
export function resource(name) {
  return {
    [Symbol.dispose]() {
      log.push(`dispose ${name}`);
    },
  };
}
using held = resource("dependency");
log.push(`dependency body ${typeof held[Symbol.dispose]}`);
export const exported = held;
