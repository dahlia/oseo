import {
  checkRestoredMise,
  prepareMise,
} from "../../../tools/ci/mise-bootstrap.ts";

try {
  const env = process.env;
  if (env.INPUT_PHASE === "restore") {
    await checkRestoredMise(
      env.INPUT_DIRECTORY,
      env["INPUT_CACHE-HIT"] === "true",
      env.INPUT_SHA256,
    );
  } else if (env.INPUT_PHASE === "prepare") {
    await prepareMise(
      env.RUNNER_TEMP,
      env.GITHUB_OUTPUT,
      env.GITHUB_ENV,
      env["INPUT_CONFIG-HASH"],
      env["INPUT_INSTALL-ARGS"],
    );
  } else {
    throw new Error("Unknown mise policy phase");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
