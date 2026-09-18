const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const clientRoot = resolve(__dirname, "../../client/src/components/dashboard");

test("l'admin propose la vérification smsmode sans approbation manuelle", () => {
  const source = readFileSync(
    resolve(clientRoot, "admin/sms/sms-monitoring.admin.component.js"),
    "utf8",
  );

  assert.match(source, /À créer chez smsmode/);
  assert.match(source, /Vérifier chez smsmode/);
  assert.match(source, /sms-sender\/verify/);
  assert.match(source, />Module SMS</);
  assert.match(source, /sender\.moduleActive \? "Actif" : "Inactif"/);
  assert.doesNotMatch(source, />\s*Approuver\s*</);
});

test("les interfaces restaurateur n'exposent plus de champ Sender ID", () => {
  const reminders = readFileSync(
    resolve(
      clientRoot,
      "_shared/reservations/sms-reminders.reservations.component.js",
    ),
    "utf8",
  );
  const destinations = readFileSync(
    resolve(
      clientRoot,
      "_shared/reservations/sms-destinations-modal.reservations.component.js",
    ),
    "utf8",
  );

  assert.doesNotMatch(reminders, /Sender ID/);
  assert.doesNotMatch(destinations, /Sender ID/);
});
