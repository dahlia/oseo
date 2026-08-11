export const first = { value: 1, enumerable: true };
export const second = {
  configurable: true,
  enumerable: true,
  get: function () {
    return 22;
  },
};

export function bump() {
  first.value = 11;
  first.writable = true;
}
