// DS-11: static namespace observations in each original usage context.
import * as namespace from "./target.mjs";

let completed = 0;
function done(error) {
  if (error !== undefined) console.log("failure", error.name);
  completed++;
  if (completed === 18) console.log("completed", completed);
}
function observe(label, imported) {
  console.log(label, imported.default, imported.x, imported.z);
}

// nested-arrow-assignment-expression-eval-script-code-host-resolves-module-
// code.js
{
  let f = () =>
    Promise.resolve(namespace).then((imported) => {
      observe("usage-01", imported);
    });

  f().then(done, done).catch(done);
}

// nested-arrow-import-then-eval-script-code-host-resolves-module-code.js
{
  let f = () => {
    return Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-02", imported);
      })
      .then(done, done)
      .catch(done);
  };

  f();
}

// nested-async-arrow-function-await-eval-script-code-host-resolves-module-
// code.js
{
  const f = async () => {
    await Promise.resolve(namespace).then((imported) => {
      observe("usage-03", imported);
    });
  };

  f().then(done, done).catch(done);
}

// nested-async-arrow-function-return-await-eval-script-code-host-resolves-
// module-code.js
{
  const f = async () => await Promise.resolve(namespace);

  f()
    .then((imported) => {
      observe("usage-04", imported);
    })
    .then(done, done)
    .catch(done);
}

// nested-async-function-await-eval-script-code-host-resolves-module-code.js
{
  async function f() {
    await Promise.resolve(namespace).then((imported) => {
      observe("usage-05", imported);
    });
  }

  f().then(done, done).catch(done);
}

// nested-async-function-eval-script-code-host-resolves-module-code.js
{
  async function f() {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-06", imported);
      })
      .then(done, done)
      .catch(done);
  }

  f();
}

// nested-async-function-return-await-eval-script-code-host-resolves-module-
// code.js
{
  async function f() {
    return await Promise.resolve(namespace);
  }

  f()
    .then((imported) => {
      observe("usage-07", imported);
    })
    .then(done, done)
    .catch(done);
}

// nested-async-gen-await-eval-script-code-host-resolves-module-code.js
{
  let callCount = 0;

  async function* f() {
    await Promise.resolve(namespace).then((imported) => {
      observe("usage-08", imported);

      callCount++;
    });
  }

  f()
    .next()
    .then(() => {
      console.log("generator call count", callCount);
    })
    .then(done, done)
    .catch(done);
}

// nested-async-gen-return-await-eval-script-code-host-resolves-module-code.js
{
  async function* f() {
    return await Promise.resolve(namespace);
  }

  f()
    .next()
    .then(({ value: imported }) => {
      observe("usage-09", imported);
    })
    .then(done, done)
    .catch(done);
}

// nested-block-import-then-eval-script-code-host-resolves-module-code.js
{
  {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-10", imported);
      })
      .then(done, done)
      .catch(done);
  }
}

// nested-do-while-eval-script-code-host-resolves-module-code.js
{
  do {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-11", imported);
      })
      .then(done, done)
      .catch(done);
  } while (false);
}

// nested-else-import-then-eval-script-code-host-resolves-module-code.js
{
  if (false) {
  } else {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-12", imported);
      })
      .then(done, done)
      .catch(done);
  }
}

// nested-function-import-then-eval-script-code-host-resolves-module-code.js
{
  function f() {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-13", imported);
      })
      .then(done, done)
      .catch(done);
  }
  f();
}

// nested-if-braceless-eval-script-code-host-resolves-module-code.js
{
  if (true)
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-14", imported);
      })
      .then(done, done)
      .catch(done);
}

// nested-if-import-then-eval-script-code-host-resolves-module-code.js
{
  if (true) {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-15", imported);
      })
      .then(done, done)
      .catch(done);
  }
}

// nested-while-import-then-eval-script-code-host-resolves-module-code.js
{
  let x = 0;
  while (!x) {
    x++;
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-16", imported);
      })
      .then(done, done)
      .catch(done);
  }
}

// syntax-nested-block-labeled-eval-script-code-host-resolves-module-code.js
{
  label: {
    Promise.resolve(namespace)
      .then((imported) => {
        observe("usage-17", imported);
      })
      .then(done, done)
      .catch(done);
  }
}

// top-level-import-then-eval-script-code-host-resolves-module-code.js
{
  Promise.resolve(namespace)
    .then((imported) => {
      observe("usage-18", imported);
    })
    .then(done, done)
    .catch(done);
}
