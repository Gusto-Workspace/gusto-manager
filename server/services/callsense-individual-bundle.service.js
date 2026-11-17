// The recorded submission is the restaurant's proof of ownership. Legacy or
// cloned bundles without that evidence require administrative reconciliation.
function requiresIndividualBundle(draft) {
  return draft?.bundleCloneOperation === "completed" || Boolean(draft?.regulatoryBundleSid &&
    (!draft.regulatorySubmission?.bundleSid || draft.regulatorySubmission.bundleSid !== draft.regulatoryBundleSid));
}
module.exports = { requiresIndividualBundle };
