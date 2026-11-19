import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRosterResponse, canManagePersonnel, employeeDirectoryEntry, filterDirectory,
} from "../src/components/dashboard/employees/employee-directory.utils.mjs";

const employee = {
  _id: "one", firstname: "Élodie", lastname: "Dûpont", email: "test@example.test", post: "Ancien poste",
  restaurantProfiles: [
    { restaurant: "first", snapshot: { post: "Cuisine" }, employment: { contractType: "CDI" }, options: { employees: true } },
    { restaurant: "second", snapshot: { post: "Salle" }, employment: { contractType: "CDD" }, options: { employees: false } },
  ],
};
const accountant = { _id: "two", firstname: "Alex", lastname: "Test", accountType: "accountant" };

test("the directory uses the current restaurant's job and contract and combines accent-insensitive filters", () => {
  const entries = [employee, accountant].map((member) => employeeDirectoryEntry(member, "second"));
  assert.equal(entries[0].post, "Salle");
  assert.equal(entries[0].contract, "CDD");
  assert.equal(employeeDirectoryEntry(employee, "first").post, "Cuisine");
  assert.deepEqual(filterDirectory(entries, { search: "dupont elodie", post: "salle", account: "employee", access: "email" }), [entries[0]]);
  assert.deepEqual(filterDirectory(entries, { account: "accountant", access: "no-email" }), [entries[1]]);
  assert.deepEqual(filterDirectory(entries, { post: "cuisine", search: "elodie" }), []);
});

test("HR management is scoped to the selected restaurant and late updates cannot replace a new roster", () => {
  const first = { _id: "first", employees: [employee, accountant], options: { employees: true } };
  const second = { ...first, _id: "second" };
  assert.equal(canManagePersonnel(first, { id: "one", role: "employee" }), true);
  assert.equal(canManagePersonnel(second, { id: "one", role: "employee" }), false);
  assert.equal(canManagePersonnel(first, { id: "two", role: "accountant" }), false);
  assert.equal(canManagePersonnel({ ...first, options: {} }, { role: "owner" }), false);
  assert.equal(canManagePersonnel(first, { role: "owner" }), true);
  assert.equal(applyRosterResponse(second, "first", { _id: "first", employees: [] }), second);
  assert.equal(applyRosterResponse(first, "first", { _id: "second", employees: [] }), first);
  assert.deepEqual(applyRosterResponse(first, "first", { _id: "first", employees: [] }), { ...first, employees: [], accountants: [] });
});
