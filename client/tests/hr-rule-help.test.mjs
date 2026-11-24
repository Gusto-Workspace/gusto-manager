import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hrRuleHelp } from "../src/components/dashboard/employees/hr-rule-help.mjs";
import { hrSteps, questionsFor } from "../src/components/dashboard/employees/hr-questionnaire.mjs";

test("the six settings families share contextual help with the migration preview", () => {
  for (const family of ["rules", "overtime", "hoursRules", "absenceRules", "leaveRules", "clockRules"]) {
    assert.ok(hrRuleHelp[family].intro);
    assert.ok(hrRuleHelp[family].date);
  }
  assert.match(hrRuleHelp.hoursRules.start, /Fixer le solde.*dimanche précédent/);
  assert.match(hrRuleHelp.hoursRules.enhanced, /3 h majorées à 10 % ajoutent 3 h 18/);
  assert.match(hrRuleHelp.absenceRules.categories, /par jour, même pour une demi-journée/);
  assert.match(hrRuleHelp.clockRules.pause, /absente ou dure zéro/);
  assert.match(hrRuleHelp.clockRules.date, /au pointage d’entrée.*déjà commencés gardent leur règle/);
  assert.match(hrRuleHelp.clockRules.disabled, /heures pointées sans arrondi.*pause pointée.*planning/);
  assert.match(hrRuleHelp.rules.amount, /vide.*zéro/i);
});

test("each questionnaire family has its own restaurant and administration wording", () => {
  assert.deepEqual(hrSteps.map(([kind]) => kind), ["clockRules", "overtime", "hoursRules", "leaveRules", "absenceRules", "rules"]);
  for (const [kind, , owner, admin] of hrSteps) {
    assert.match(owner, /vous|vos|votre/i);
    assert.match(admin, /le restaurant/i);
    assert.doesNotMatch(admin, /\b(?:vous|vos|votre)\b/i);
    assert.ok(questionsFor(kind, {}).length > 0);
  }
});

test("planning gates the counter on visible eligible employees and renders numeric zero", () => {
  const read = (name) => readFileSync(new URL(`../src/components/dashboard/employees/${name}.employees.component.js`, import.meta.url), "utf8");
  assert.match(read("planning"), /filteredEmployees\.some\(.*hasCounter === true\)/);
  assert.match(read("planning-grid"), /Number\.isFinite\(counter\?\.balance\)/);
  assert.match(read("planning-grid"), /Number\.isFinite\(counter\?\.annualRemaining\)/);
});
