import { assertRuntimeEnvironmentReady } from "../src/api/server/runtimeValidation";

const main = () => {
  process.env.FLASHLY_ENV ??= "staging";

  const result = assertRuntimeEnvironmentReady();

  if (result.environment !== "staging") {
    throw new Error(`Expected FLASHLY_ENV=staging, got ${result.environment}.`);
  }

  console.log("PASS staging runtime environment verification");
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
