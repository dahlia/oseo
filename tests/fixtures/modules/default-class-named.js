export default class NamedDefault {
  constructor(value) {
    this.value = value;
  }

  read() {
    return this.value;
  }

  static self() {
    return NamedDefault === this;
  }
}

console.log("named default local", NamedDefault.name, NamedDefault.self());
