const pending = Promise.reject("handled after await");

await Promise.resolve(0);

pending.catch(function handle(reason) {
  console.log(reason);
});
