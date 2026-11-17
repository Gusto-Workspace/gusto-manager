// A missing, inaccessible or mismatched account must never be treated as active.
async function requireActiveAccount(client, accountSid) {
  if (!accountSid || !client?.api?.accounts) throw new Error("statut_sous_compte_indisponible");
  let account;
  try { account = await client.api.accounts(accountSid).fetch(); }
  catch (_) { throw new Error("statut_sous_compte_indisponible"); }
  if (account?.sid !== accountSid || account.status !== "active") throw new Error("sous_compte_inactif_ou_non_concordant");
  return account;
}

module.exports = { requireActiveAccount };
