const versionedCollectiveKinds = ["hoursRules", "absenceRules", "leaveRules"];

function ruleVersions(inputs, kind) {
  return inputs.filter((item) => item.kind === kind).sort((first, second) => second.date.localeCompare(first.date));
}

function ruleAt(versions, date) {
  return versions.find((item) => item.date === "-" || item.date <= date);
}

module.exports = { versionedCollectiveKinds, ruleVersions, ruleAt };
