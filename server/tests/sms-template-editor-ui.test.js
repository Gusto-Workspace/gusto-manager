const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const sharedRoot = resolve(
  __dirname,
  "../../client/src/components/dashboard/_shared/reservations",
);
const utilsSource = readFileSync(
  resolve(sharedRoot, "sms-message.utils.js"),
  "utf8",
);
const utilsPromise = import(
  `data:text/javascript;base64,${Buffer.from(utilsSource).toString("base64")}`
);

test("parse les placeholders historiques en tokens français", async () => {
  const {
    SMS_TEMPLATE_VARIABLES,
    splitSmsTemplateTokens,
    smsTemplateToBackend,
  } = await utilsPromise;
  assert.deepEqual(SMS_TEMPLATE_VARIABLES, [
    { backend: "{firstName}", display: "{Prénom}" },
    { backend: "{date}", display: "{Date}" },
    { backend: "{time}", display: "{Heure}" },
    { backend: "{guests}", display: "{Nombre de personnes}" },
    { backend: "{restaurantName}", display: "{Nom du restaurant}" },
  ]);
  const parts = splitSmsTemplateTokens(
    "Bonjour {firstName}{date} chez {restaurantName}",
  );

  assert.deepEqual(
    parts.filter((part) => part.type === "token").map((part) => part.value),
    ["{Prénom}", "{Date}", "{Nom du restaurant}"],
  );
  assert.equal(
    smsTemplateToBackend(parts.map((part) => part.value).join("")),
    "Bonjour {firstName}{date} chez {restaurantName}",
  );
});

test("Backspace et Delete suppriment un token complet", async () => {
  const { deleteSmsTemplateSelection } = await utilsPromise;
  const value = "Bonjour {Prénom}, pour rappel";

  assert.deepEqual(deleteSmsTemplateSelection(value, 16, 16, "backward"), {
    value: "Bonjour , pour rappel",
    cursor: 8,
  });
  assert.deepEqual(deleteSmsTemplateSelection(value, 8, 8, "forward"), {
    value: "Bonjour , pour rappel",
    cursor: 8,
  });
  assert.deepEqual(deleteSmsTemplateSelection(value, 12, 12, "backward"), {
    value: "Bonjour , pour rappel",
    cursor: 8,
  });
});

test("gère les tokens consécutifs et laisse le texte normal au navigateur", async () => {
  const { deleteSmsTemplateSelection } = await utilsPromise;
  const value = "{Prénom}{date} texte";

  assert.deepEqual(deleteSmsTemplateSelection(value, 8, 8, "forward"), {
    value: "{Prénom} texte",
    cursor: 8,
  });
  assert.equal(deleteSmsTemplateSelection(value, 18, 18, "backward"), null);
});

test("l'éditeur utilise des tokens non éditables et un collage texte seul", () => {
  const source = readFileSync(
    resolve(sharedRoot, "sms-template-editor.reservations.component.js"),
    "utf8",
  );

  assert.match(source, /token\.contentEditable = "false"/);
  assert.match(source, /font-semibold/);
  assert.match(source, /clipboardData\.getData\("text\/plain"\)/);
  assert.match(source, /role="textbox"/);
  assert.match(source, /aria-invalid=\{invalid\}/);
});

test("calcule les segments GSM-7 concaténés aux bonnes frontières", async () => {
  const { analyzeSingleSms, getGsm7SmsSegmentCount } = await utilsPromise;

  assert.equal(analyzeSingleSms("a".repeat(159)).valid, true);
  assert.equal(getGsm7SmsSegmentCount(159), 1);
  assert.equal(analyzeSingleSms("a".repeat(160)).valid, true);
  assert.equal(getGsm7SmsSegmentCount(160), 1);
  assert.equal(analyzeSingleSms("a".repeat(161)).valid, true);
  assert.equal(analyzeSingleSms("a".repeat(161)).segmentCount, 2);
  assert.equal(getGsm7SmsSegmentCount(161), 2);
  assert.equal(getGsm7SmsSegmentCount(306), 2);
  assert.equal(getGsm7SmsSegmentCount(307), 3);
  assert.equal(getGsm7SmsSegmentCount(459), 3);
  assert.equal(getGsm7SmsSegmentCount(460), 4);
});

test("la finition visuelle réserve l'erreur rouge aux caractères incompatibles", () => {
  const editorSource = readFileSync(
    resolve(sharedRoot, "sms-template-editor.reservations.component.js"),
    "utf8",
  );
  const remindersSource = readFileSync(
    resolve(sharedRoot, "sms-reminders.reservations.component.js"),
    "utf8",
  );
  const previewSource = readFileSync(
    resolve(sharedRoot, "sms-preview-modal.reservations.component.js"),
    "utf8",
  );

  assert.match(editorSource, /minmax\(0,3fr\).*minmax\(12rem,1fr\)/);
  assert.match(editorSource, /focus:ring-1 focus:ring-darkBlue\/10/);
  assert.match(editorSource, /border-red bg-red\/5/);
  assert.match(editorSource, /focus:border-red focus:ring-1 focus:ring-red\/20/);
  assert.doesNotMatch(editorSource, /focus:ring-2/);
  assert.match(remindersSource, /invalid=\{messageIsNotGsm7\}/);
  assert.match(remindersSource, /Coût estimé : \{smsSegmentCount\} SMS/);
  assert.match(remindersSource, /Le message reste utilisable, mais chaque envoi consommera/);
  assert.doesNotMatch(remindersSource, /messageExceedsLimit/);
  assert.match(previewSource, /analysis\.segmentCount/);
  assert.match(previewSource, /caractères · \$\{analysis\.segmentCount\} SMS/);
  assert.doesNotMatch(previewSource, /SMS · GSM-7/);
});

test("normalise les caractères sûrs sans modifier les tokens", async () => {
  const {
    analyzeSingleSms,
    normalizeSmsTemplateSelectionToGsm7,
    normalizeSmsTemplateToGsm7,
    normalizeToGsm7,
    renderSmsPreview,
    smsTemplateToBackend,
  } = await utilsPromise;

  assert.equal(normalizeToGsm7("ô").value, "o");
  assert.equal(normalizeToGsm7("bientôt").value, "bientot");
  assert.equal(normalizeToGsm7("ä").value, "ä");
  assert.equal(normalizeToGsm7("î").value, "i");
  assert.equal(normalizeToGsm7("ç").value, "c");
  assert.equal(normalizeToGsm7("éèàùÇÖÑÜ").value, "éèàùÇÖÑÜ");
  assert.equal(normalizeToGsm7("Jörg Müller").value, "Jörg Müller");
  assert.equal(normalizeToGsm7("Straße").value, "Straße");
  assert.equal(normalizeToGsm7("Peña").value, "Peña");
  assert.equal(normalizeToGsm7("¿Hola?").value, "¿Hola?");
  assert.equal(normalizeToGsm7("Café").value, "Café");

  const template = normalizeSmsTemplateToGsm7(
    "À bientôt {Prénom} {Date} {Nom du restaurant}",
  );
  assert.equal(
    template.value,
    "A bientot {Prénom} {Date} {Nom du restaurant}",
  );
  assert.equal(template.adapted, true);

  const withCursor = normalizeSmsTemplateSelectionToGsm7(
    "A bientôt {Prénom}",
    9,
    9,
  );
  assert.equal(withCursor.value, "A bientot {Prénom}");
  assert.equal(withCursor.start, 9);
  assert.equal(withCursor.end, 9);

  const preview = renderSmsPreview(smsTemplateToBackend(withCursor.value), {
    firstName: "Camille",
  });
  assert.equal(preview, "A bientot Camille");
  assert.equal(analyzeSingleSms(preview).encoding, "gsm7");
});

test("conserve les caractères sans translittération sûre comme incompatibles", async () => {
  const { normalizeToGsm7 } = await utilsPromise;
  const result = normalizeToGsm7("Bonjour 😊");

  assert.equal(result.value, "Bonjour 😊");
  assert.equal(result.adapted, false);
  assert.deepEqual(result.incompatibleCharacters, ["😊"]);
});
