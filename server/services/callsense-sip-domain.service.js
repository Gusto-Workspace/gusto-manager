function newDomainName(restaurantId, accountSid) {
  const restaurant = String(restaurantId).toLowerCase();
  const account = String(accountSid || "").toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(restaurant) || !/^ac[a-f0-9]{32}$/.test(account)) throw new Error("Identifiants SIP invalides");
  // One DNS label (59 characters); a new subaccount gets a different name.
  return `g-${restaurant}-${account.slice(2)}.sip.twilio.com`;
}

function legacyDomainName(restaurantId) {
  return `gusto-${restaurantId}.sip.twilio.com`;
}

function attemptedDomainName(restaurantId, draft) {
  return draft.operationAttempts?.domain?.domainName || legacyDomainName(restaurantId);
}

module.exports = { newDomainName, legacyDomainName, attemptedDomainName };
