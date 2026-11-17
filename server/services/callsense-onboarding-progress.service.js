// Only persisted, restaurant-specific evidence can unlock an onboarding step.
function currentStep(restaurant, draft) {
  if (![restaurant?.name, restaurant?.address?.line1, restaurant?.address?.zipCode, restaurant?.address?.city, restaurant?.address?.country, restaurant?.phone, restaurant?.email].every(value => typeof value === "string" && value.trim())) return 0;
  if (!draft?.accountSid) return 1;
  if (!draft.regulatoryBundleSid || draft.regulatoryApproval?.bundleSid !== draft.regulatoryBundleSid || draft.regulatoryApproval?.accountSid !== draft.accountSid || draft.regulatoryApproval?.status !== "twilio-approved" || draft.regulatoryApproval?.compatible !== true) return 2;
  if (!draft.phoneNumberSid || !draft.twilioNumber || draft.numberOperation !== "completed") return 3;
  const sip = draft.sipDomain && draft.sipUsername && draft.sipCredentialOperation === "completed";
  const fallbackUrl = draft.fallbackFunction?.operation === "completed" ? draft.fallbackFunction.url : draft.checklist?.fallbackTest && draft.verifiedFallbackUrl;
  const fallback = fallbackUrl && draft.fallbackProbeAt && draft.fallbackProbeUrl === fallbackUrl && draft.fallbackProbeSipUri === `sip:${draft.sipUsername}@${draft.sipDomain}`;
  if (!sip || !fallback || draft.webhookOperation !== "completed") return 4;
  if (!draft.checklist?.terminalConnected || !["direct", "forward"].includes(draft.forwardingScenario) || draft.forwardingScenario === "forward" && !draft.checklist.operatorForwarding) return 5;
  return 6;
}
module.exports = { currentStep };
