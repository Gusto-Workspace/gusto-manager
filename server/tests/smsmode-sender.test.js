const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const SmsModeProvider = require("../services/sms/smsmode-provider");

test("trouve un Sender ID sur une page et un channel SMS ultérieurs", async (t) => {
  const originalGet = axios.get;
  const pages = [];
  axios.get = async (url, config) => {
    pages.push({ url, config });
    if (config.params.page === 1) {
      return {
        data: {
          items: [
            { channelId: "rcs", type: "RCS", fromFieldList: ["SAVEURS"] },
            { channelId: "sms-1", type: "SMS", flow: "TRANSACTIONAL", fromFieldList: ["AUTRE"] },
          ],
          totalPages: 2,
        },
      };
    }
    return {
      data: {
        items: [
          { channelId: "sms-2", name: "mainChannel", type: "SMS", flow: "TRANSACTIONAL", defaultFromField: "36034", fromFieldList: ["36034", "SAVEURS"] },
        ],
        totalPages: 2,
      },
    };
  };
  t.after(() => { axios.get = originalGet; });

  const result = await new SmsModeProvider({
    apiKey: "test-key",
    baseUrl: "https://smsmode.invalid",
  }).senderExists("SAVEURS");

  assert.deepEqual(result, {
    exists: true,
    channelId: "sms-2",
    channelName: "mainChannel",
  });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].url, "https://smsmode.invalid/commons/v1/channels");
  assert.equal(pages[0].config.headers["X-Api-Key"], "test-key");
});

test("reconnaît defaultFromField et retourne false après la dernière page", async (t) => {
  const originalGet = axios.get;
  axios.get = async () => ({
    data: {
      channels: [
        { channelId: "sms", type: "SMS", defaultFromField: "36034", fromFieldList: [] },
      ],
      totalPages: 1,
    },
  });
  t.after(() => { axios.get = originalGet; });

  const provider = new SmsModeProvider({ apiKey: "test-key" });
  assert.equal((await provider.senderExists("36034")).exists, true);
  assert.deepEqual(await provider.senderExists("INCONNU"), { exists: false });
});

test("une réponse channels inattendue est une erreur contrôlée", async (t) => {
  const originalGet = axios.get;
  axios.get = async () => ({ data: { unexpected: true } });
  t.after(() => { axios.get = originalGet; });

  await assert.rejects(
    () => new SmsModeProvider({ apiKey: "test-key" }).senderExists("SAVEURS"),
    /Réponse channels smsmode invalide/,
  );
});
