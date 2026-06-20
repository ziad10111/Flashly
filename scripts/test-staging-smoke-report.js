const { formatStagingSmokeReport, getCategoryStatus } = require("./staging-smoke-report");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const steps = [
  { category: "health", status: "PASS" },
  { category: "readiness", status: "PASS" },
  { category: "auth", status: "PASS" },
  { category: "upload", status: "PASS" },
  { category: "chunk", status: "PASS" },
  { category: "extraction", status: "PASS" },
  { category: "generation", status: "FAIL" },
  { category: "security", status: "PASS" },
];

assert(getCategoryStatus(steps, "ownership") === "NOT RUN", "Expected ownership to be NOT RUN.");
assert(getCategoryStatus(steps, "review") === "NOT RUN", "Expected review to be NOT RUN.");
assert(getCategoryStatus(steps, "billing") === "NOT RUN", "Expected billing to be NOT RUN.");
assert(getCategoryStatus(steps, "generation") === "FAIL", "Expected generation to be FAIL.");

const report = formatStagingSmokeReport(steps);
assert(report.includes("Generation: FAIL"), "Expected generation failure to remain visible.");
assert(report.includes("Ownership: NOT RUN"), "Expected ownership to be NOT RUN.");
assert(report.includes("Review/progress: NOT RUN"), "Expected review/progress to be NOT RUN.");
assert(report.includes("RevenueCat: NOT RUN"), "Expected RevenueCat to be NOT RUN.");
assert(report.includes("Security: PASS"), "Expected already executed security phases to remain PASS.");
assert(report.includes("Overall: FAIL"), "Expected overall result to be FAIL.");

console.log("PASS staging smoke report tests");
