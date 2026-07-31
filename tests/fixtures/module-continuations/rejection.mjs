console.log("rejection before");
await Promise.reject("module rejection");
console.log("rejection after");
