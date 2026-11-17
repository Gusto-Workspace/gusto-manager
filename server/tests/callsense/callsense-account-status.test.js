const test = require("node:test");
const assert = require("node:assert/strict");
const { requireActiveAccount } = require("../../services/callsense/callsense-account-status.service");

test("seul le sous-compte demandé et actif est utilisable", async () => {
  const sid = `AC${"1".repeat(32)}`;
  const client = (result) => ({ api: { accounts: (requested) => ({ fetch: async () => {
    assert.equal(requested, sid);
    if (result instanceof Error) throw result;
    return result;
  } }) } });
  assert.equal((await requireActiveAccount(client({ sid, status: "active" }), sid)).sid, sid);
  for (const account of [{ sid, status: "closed" }, { sid, status: "suspended" }, { sid, status: "unknown" }, { sid: `AC${"2".repeat(32)}`, status: "active" }]) {
    await assert.rejects(requireActiveAccount(client(account), sid), /inactif_ou_non_concordant/);
  }
  await assert.rejects(requireActiveAccount(client(new Error("network")), sid), /indisponible/);
  await assert.rejects(requireActiveAccount({}, sid), /indisponible/);
});
