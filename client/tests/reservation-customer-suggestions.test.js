const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const vm = require("node:vm");

const components = path.join(__dirname, "../src/components/dashboard");
function parse(file) { return parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] }); }

for (const form of ["reservations/add.reservations.component.js", "webapp/reservations/add.reservations.webapp.js"]) {
  test(`${form}: each customer input anchors its own suggestions`, () => {
    const seen = [];
    traverse(parse(path.join(components, form)), {
      JSXElement(nodePath) {
        const element = nodePath.node;
        if (element.openingElement.name.name !== "CustomerSuggestions") return;
        const query = element.openingElement.attributes.find((attr) => attr.name?.name === "query").value.expression.property.name;
        const input = element.children.find((child) => child.type === "JSXElement" && child.openingElement.name.name === "input");
        assert.ok(input);
        const name = input.openingElement.attributes.find((attr) => attr.name?.name === "name").value.value;
        assert.equal(query, name);
        const field = element.openingElement.attributes.find((attr) => attr.name?.name === "field").value.value;
        assert.equal(field, name.replace(/^customer/, "").replace(/^./, (letter) => letter.toLowerCase()));
        assert.equal(nodePath.findParent((parent) => parent.isJSXElement() && parent.node.openingElement.attributes.some((attr) => attr.name?.name === "className" && attr.value?.value?.includes("overflow-hidden"))), null);
        seen.push(name);
      },
    });
    assert.deepEqual(seen, ["customerFirstName", "customerLastName", "customerEmail", "customerPhone"]);
  });
}

test("suggestions overlay their relative input and close on outside pointer interaction", () => {
  const source = fs.readFileSync(path.join(components, "reservations/customer-suggestions.reservations.component.js"), "utf8");
  assert.match(source, /className="relative w-full min-w-0 flex-initial self-start"/);
  assert.match(source, /absolute left-0 top-full z-50 mt-1 max-h-60 w-full/);
  assert.match(source, /pointerdown/);
  assert.match(source, /max-h-60/);
});

for (const form of ["reservations/add.reservations.component.js", "webapp/reservations/add.reservations.webapp.js"]) {
  test(`${form}: selecting a customer preserves manual and existing values`, () => {
    const source = fs.readFileSync(path.join(components, form), "utf8");
    let declaration;
    traverse(parse(path.join(components, form)), { FunctionDeclaration(nodePath) { if (nodePath.node.id?.name === "selectCustomer") declaration = nodePath.node; } });
    let state = { customerFirstName: "Em", customerLastName: "", customerEmail: "manuel@example.com", customerPhone: "" };
    const context = { editedCustomerFields: { current: new Set(["customerFirstName", "customerPhone"]) }, setReservationData: (update) => { state = update(state); } };
    vm.runInNewContext(`${source.slice(declaration.start, declaration.end)}; selectCustomer({ firstName: "Emilie", lastName: "Martin", email: "client@example.com", phone: "0612345678" });`, context);
    assert.equal(state.customerFirstName, "Em");
    assert.equal(state.customerLastName, "Martin");
    assert.equal(state.customerEmail, "manuel@example.com");
    assert.equal(state.customerPhone, "");
  });
}
