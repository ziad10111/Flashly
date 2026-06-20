const stagingSmokeCategories = [
  ["Health", "health"],
  ["Readiness", "readiness"],
  ["Authentication", "auth"],
  ["Direct upload", "upload"],
  ["Chunk upload", "chunk"],
  ["Cloud extraction", "extraction"],
  ["Generation", "generation"],
  ["Database persistence", "persistence"],
  ["Ownership", "ownership"],
  ["Review/progress", "review"],
  ["RevenueCat", "billing"],
  ["Security", "security"],
];

const getCategoryStatus = (steps, category) => {
  const related = steps.filter((step) => step.category === category);

  if (related.length === 0) {
    return "NOT RUN";
  }

  return related.every((step) => step.status === "PASS") ? "PASS" : "FAIL";
};

const formatStagingSmokeReport = (steps) => {
  const lines = ["", "Staging validation report", "========================="];

  for (const [label, category] of stagingSmokeCategories) {
    lines.push(`${label}: ${getCategoryStatus(steps, category)}`);
  }

  const failed = steps.filter((step) => step.status === "FAIL");
  lines.push(`Overall: ${failed.length === 0 ? "PASS" : "FAIL"}`);

  return lines.join("\n");
};

module.exports = {
  formatStagingSmokeReport,
  getCategoryStatus,
  stagingSmokeCategories,
};
