const checklistFields = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];

function requiredChecklistFields(draft) {
  const directSoftphone = draft?.terminalType === "softphone" && draft?.forwardingScenario === "direct";
  return checklistFields.filter(field => !(field === "operatorForwarding" && draft?.forwardingScenario === "direct") && !(directSoftphone && ["outgoingTest", "emergencyTest"].includes(field)));
}

module.exports = { checklistFields, requiredChecklistFields };
