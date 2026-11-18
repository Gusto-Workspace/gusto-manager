const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const vm = require("node:vm");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");

const components = path.join(__dirname, "../src/components/dashboard");
const suggestionsFile = path.join(components, "reservations/customer-suggestions.reservations.component.js");
const forms = [
  "reservations/add.reservations.component.js",
  "webapp/reservations/add.reservations.webapp.js",
];
function parse(file) { return parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] }); }

for (const form of forms) {
  test(`${form}: each customer input anchors its own suggestions`, () => {
    const seen = [];
    traverse(parse(path.join(components, form)), {
      JSXElement(nodePath) {
        const element = nodePath.node;
        if (element.openingElement.name.name !== "CustomerSuggestions") return;
        const attributes = element.openingElement.attributes;
        const query = attributes.find((attr) => attr.name?.name === "query").value.expression.property.name;
        assert.equal(attributes.find((attr) => attr.name?.name === "onSelect").value.expression.name, "selectCustomer");
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
  const source = fs.readFileSync(suggestionsFile, "utf8");
  assert.match(source, /className="relative w-full min-w-0 flex-initial self-start"/);
  assert.match(source, /absolute left-0 top-full z-50 mt-1 max-h-60 w-full/);
  assert.match(source, /pointerdown/);
  assert.match(source, /max-h-60/);
});

const customer = {
  _id: "first",
  firstName: "Léo",
  lastName: "Dupont",
  email: "leo@example.com",
  phone: "+33 6 12 34 56 78",
};
const other = { _id: "second", firstName: "Emma", lastName: "Martin" };
const contact = {
  customerFirstName: customer.firstName,
  customerLastName: customer.lastName,
  customerEmail: customer.email,
  customerPhone: customer.phone,
};

function formHarness(form) {
  const filename = path.join(components, form);
  const source = fs.readFileSync(filename, "utf8");
  const methods = [];
  traverse(parse(filename), {
    FunctionDeclaration({ node }) {
      if (["selectCustomer", "handleInputChange"].includes(node.id?.name)) {
        methods.push(source.slice(node.start, node.end));
      }
    },
  });
  let state = { numberOfGuests: "3", customerEmail: "ancien@example.com" };
  const handlers = vm.runInNewContext(`${methods.join("\n")}; ({ selectCustomer, handleInputChange });`, {
    cancelCallPrefill() {},
    setReservationData(update) { state = update(state); },
  });
  return {
    get state() { return state; },
    select: handlers.selectCustomer,
    type(name, value) { handlers.handleInputChange({ target: { name, value } }); },
  };
}

function load(filename, bindings) {
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[packages.presetReact().default, { runtime: "automatic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  });
  const module = { exports: {} };
  const { modules, globals = {} } = bindings;
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    (name) => modules[name] ?? require(name), module, module.exports, ...Object.values(globals),
  );
  return module.exports.default;
}

function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  return {
    render(Component, props) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      effects.forEach((run) => run());
      return tree;
    },
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value) => { slots[i] = value; }];
      },
      useRef(initial) { return slots[cursor++] ||= { current: initial }; },
      useCallback(callback) { return slots[cursor++] ||= callback; },
      useEffect(effect, dependencies) {
        const i = cursor++;
        const previous = slots[i];
        if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
        effects.push(() => {
          previous?.cleanup?.();
          slots[i] = { dependencies, cleanup: effect() };
        });
      },
    },
  };
}

function suggestionsHarness(onSelect, field) {
  const h = hookHarness();
  const timers = new Map();
  const requests = [];
  const listeners = new Map();
  const Component = load(suggestionsFile, {
    modules: {
      react: h.react,
      axios: {
        get(_url, options) {
          return new Promise((resolve) => requests.push({ ...options, resolve }));
        },
      },
    },
    globals: {
      setTimeout(callback) {
        const id = Symbol();
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
      document: {
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
      },
    },
  });
  return {
    render: (query) => h.render(Component, { restaurantId: "restaurant", query, field, onSelect }),
    dispatchSearch() {
      const jobs = [...timers.values()];
      timers.clear();
      return Promise.all(jobs.map((job) => job()));
    },
    outside() { listeners.get("pointerdown")?.({ target: {} }); },
    requests,
  };
}

function option(tree) {
  return tree.props.children[1]?.props?.children[0].props.children;
}

async function show(harness, query, result) {
  const search = harness.dispatchSearch();
  harness.requests.at(-1).resolve({ data: { customers: [result] } });
  await search;
  return option(harness.render(query));
}

for (const form of forms) {
  test(`${form}: clicking any suggestion replaces the active field and reapplies the entire contact`, async () => {
    for (const [field, name, partial] of [
      ["firstName", "customerFirstName", "le"],
      ["lastName", "customerLastName", "du"],
      ["email", "customerEmail", "leo@"],
      ["phone", "customerPhone", "06"],
    ]) {
      const page = formHarness(form);
      const harness = suggestionsHarness(page.select, field);
      let tree = harness.render("");
      tree.props.onFocusCapture();
      page.type(name, partial);
      tree.props.onChangeCapture();
      tree = harness.render(partial);
      assert.equal(page.state[name], partial);
      assert.equal(page.state.customerPhone, name === "customerPhone" ? partial : undefined);
      const button = await show(harness, partial, customer);
      assert.deepEqual(harness.requests.at(-1).params, { query: partial, field });
      let keptFocus = false;
      button.props.onMouseDown({ preventDefault() { keptFocus = true; } });
      assert.equal(keptFocus, true);
      button.props.onClick();
      assert.deepEqual({ ...page.state }, { numberOfGuests: "3", ...contact });

      page.type("customerPhone", "");
      page.type("customerEmail", "modifie@example.com");
      page.type(name, partial);
      tree = harness.render(partial);
      tree.props.onChangeCapture();
      harness.render(partial);
      (await show(harness, partial, customer)).props.onClick();
      assert.deepEqual({ ...page.state }, { numberOfGuests: "3", ...contact });

      const secondQuery = field === "phone" ? "+336" : "ma";
      page.type(name, secondQuery);
      harness.render(secondQuery).props.onChangeCapture();
      harness.render(secondQuery);
      assert.equal(page.state[name], secondQuery);
      (await show(harness, secondQuery, other)).props.onClick();
      assert.deepEqual({ ...page.state }, {
        numberOfGuests: "3",
        customerFirstName: "Emma",
        customerLastName: "Martin",
        customerEmail: "",
        customerPhone: "",
      });
    }
  });
}

test("requests resolving after a newer query or outside dismissal cannot restore suggestions", async () => {
  const harness = suggestionsHarness(() => { assert.fail("No customer was selected"); }, "firstName");
  harness.render("le").props.onFocusCapture();
  let tree = harness.render("le");
  const old = harness.dispatchSearch();
  tree.props.onChangeCapture();
  tree = harness.render("em");
  const current = harness.dispatchSearch();
  assert.equal(harness.requests[0].signal.aborted, true);
  harness.requests[1].resolve({ data: { customers: [other] } });
  await current;
  harness.requests[0].resolve({ data: { customers: [customer] } });
  await old;
  assert.match(option(harness.render("em")).props.children[0], /Emma/);

  tree.props.onChangeCapture();
  harness.render("leo");
  const closing = harness.dispatchSearch();
  harness.outside();
  assert.equal(harness.requests[2].signal.aborted, true);
  harness.requests[2].resolve({ data: { customers: [customer] } });
  await closing;
  assert.equal(option(harness.render("leo")), undefined);
});

test("a pending CallSense prefill respects the selected contact, including empty fields", async () => {
  const h = hookHarness();
  const identityRequests = [];
  const router = { query: { fromCall: "a".repeat(24) } };
  const hook = load(path.join(components, "../_shared/callsense/use-call-reservation-prefill.js"), {
    modules: {
      react: { ...h.react, useContext: () => ({ restaurantContext: {} }) },
      "next/router": { useRouter: () => router },
      "@/contexts/global.context": { GlobalContext: {} },
      axios: {
        async get() { return { data: { calls: [{ from: customer.phone }] } }; },
        post() { return new Promise((resolve) => identityRequests.push(resolve)); },
      },
    },
  });
  let state = {};
  const updateState = (update) => { state = update(state); };
  const render = () => h.render(() => hook("restaurant", false, updateState));
  const cancel = render();
  await new Promise(setImmediate);
  const response = {
    data: { identities: { [customer.phone]: { customerFirstName: customer.firstName } } },
  };
  cancel();
  state = { customerFirstName: "Emma", customerPhone: "" };
  identityRequests[0](response);
  await new Promise(setImmediate);
  assert.deepEqual(state, { customerFirstName: "Emma", customerPhone: "" });

  router.query.fromCall = "b".repeat(24);
  render();
  await new Promise(setImmediate);
  identityRequests[1](response);
  await new Promise(setImmediate);
  assert.equal(state.customerFirstName, "Emma");
  assert.equal(state.customerPhone, customer.phone);
});
