import { verifyRevenueCatWebhookRequest } from "../src/api/server/billing/revenuecatBillingProvider";
import { BillingWebhookError } from "../src/api/server/billing/types";

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const makeRequest = (headers?: HeadersInit) =>
  new Request("https://flashly.example/api/billing/revenuecat/webhook", {
    headers,
    method: "POST",
  });

const expectWebhookError = (name: string, status: number, action: () => void) => {
  try {
    action();
  } catch (error) {
    assert(error instanceof BillingWebhookError, `${name}: expected BillingWebhookError.`);
    assert(error.status === status, `${name}: expected HTTP ${status}, got ${error.status}.`);
    return;
  }

  throw new Error(`${name}: expected verification to fail.`);
};

const main = () => {
  expectWebhookError("missing configured secret fails closed", 500, () => {
    verifyRevenueCatWebhookRequest(makeRequest(), undefined);
  });

  expectWebhookError("missing incoming webhook auth rejects", 401, () => {
    verifyRevenueCatWebhookRequest(makeRequest(), "server-secret");
  });

  expectWebhookError("wrong incoming webhook secret rejects", 403, () => {
    verifyRevenueCatWebhookRequest(
      makeRequest({
        Authorization: "Bearer wrong-secret",
      }),
      "server-secret",
    );
  });

  assert(
    verifyRevenueCatWebhookRequest(
      makeRequest({
        Authorization: "Bearer server-secret",
      }),
      "server-secret",
    ) === true,
    "valid bearer secret should pass.",
  );

  assert(
    verifyRevenueCatWebhookRequest(
      makeRequest({
        "X-RevenueCat-Signature": "server-secret",
      }),
      "server-secret",
    ) === true,
    "valid RevenueCat signature secret should pass.",
  );

  console.info("PASS RevenueCat webhook security smoke check");
};

try {
  main();
} catch (error) {
  console.error("FAIL RevenueCat webhook security smoke check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
