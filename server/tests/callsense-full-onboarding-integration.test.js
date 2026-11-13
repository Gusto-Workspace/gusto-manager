const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("installation complète : sous-compte, conformité, achat +333 et reprise SIP sans doublons", { timeout: 60000 }, () => {
  for (let restaurant = 0; restaurant < 2; restaurant++) {
    const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/callsense-simulate-new-test.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, CALLSENSE_TEST_INTEGRATION: "1", CALLSENSE_TEST_STOP_AFTER_SIP: "1" },
    encoding: "utf8",
    timeout: 55000,
    });
    assert.equal(result.status, 0, `Simulation ${restaurant + 1} échouée :\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Étapes 1–2/);
    assert.match(result.stdout, /Étape 3/);
    assert.match(result.stdout, /Étapes 4–5/);
    assert.match(result.stdout, /Interruption pendant le build puis reprise/);
    assert.match(result.stdout, /Données temporaires de simulation supprimées/);
  }
});
