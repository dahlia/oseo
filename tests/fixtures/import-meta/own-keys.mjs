// Oseo's closed module host defines no import.meta properties.
console.log(JSON.stringify(Reflect.ownKeys(import.meta)));
