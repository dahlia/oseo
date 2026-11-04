console.log("before await");
await 0;
throw new Error("thrown after await");
