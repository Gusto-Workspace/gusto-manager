const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const babel = require("../../client/node_modules/@babel/core");
const babelRoot = "../../client/node_modules/next/dist/compiled/babel/";
const base = resolve(__dirname, "../../client/src/components/dashboard/take-away");

// Exercise the real component handlers with a small hook/JSX harness.
// Effects (customer HTTP lookup) are deliberately disabled; no network is used.
function componentHarness(filename, context = {}) {
  const slots = [];
  let cursor = 0;
  const hooks = {
    useEffect() {},
    useContext: () => context,
    useMemo: (fn) => fn(),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  const jsx = (type, props) => ({ type, props });
  function load(file) {
    const output = { exports: {} };
    const { code } = babel.transformSync(readFileSync(file, "utf8"), {
      filename: file, babelrc: false, configFile: false,
      presets: [[require(`${babelRoot}preset-react`), { runtime: "automatic" }]],
      plugins: [require(`${babelRoot}plugin-transform-modules-commonjs`)],
    });
    vm.runInNewContext(code, {
      module: output, exports: output.exports, process, crypto: require("node:crypto").webcrypto,
      require(name) {
        if (name === "react") return hooks;
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "axios") return {};
        if (name === "lucide-react") return { Check: "Check", Plus: "Plus", Trash2: "Trash2", ChevronLeft: "ChevronLeft" };
        if (name === "next/router") return { useRouter: () => ({ query: {} }) };
        if (name === "@/contexts/global.context") return { GlobalContext: {} };
        if (name.endsWith("take-away.utils")) return load(resolve(base, "take-away.utils.js"));
        if (name.endsWith("form.take-away.component")) return { FormField: "FormField" };
        if (name.endsWith("manual-order.take-away.component")) return { __esModule: true, default: "ManualOrder" };
        if (name.endsWith("header.take-away.component")) return { __esModule: true, default: "Header" };
        throw new Error(`Unexpected import: ${name}`);
      },
    }, { filename: file });
    return output.exports;
  }
  const component = load(filename).default;
  return { render(props = {}) { cursor = 0; return component(props); } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function formFixture(onCreate = async () => false) {
  const harness = componentHarness(resolve(base, "manual-order.take-away.component.js"));
  const props = {
    catalog: [{ _id: "item-1", name: "Plat", price: 25 }], deliveryZones: [],
    restaurantId: "restaurant-1", smsNotificationsEnabled: false, onCreate,
  };
  let tree;
  const render = () => { tree = harness.render(props); return tree; };
  function field(label) {
    return nodes(tree).find((node) => node.type === "FormField" && node.props.label.startsWith(label));
  }
  function change(label, value) {
    nodes(field(label).props.children).find((node) => node.type === "input").props.onChange({ target: { value } });
    render();
  }
  function submit() {
    return nodes(tree).find((node) => node.type === "button" && nodes(node).some((child) => child.type === "Check")).props.onClick();
  }
  render();
  change("Prénom", "Ada");
  change("Nom", "Lovelace");
  nodes(tree).find((node) => node.props["aria-label"] === "Article").props.onChange({ target: { value: "item-1" } });
  render();
  return { props, render, change, field, submit };
}

test("formulaire partagé : téléphone facultatif puis obligatoire selon les paramètres courants", async () => {
  const calls = [];
  const form = formFixture(async (payload) => { calls.push(payload); return false; });
  assert.equal(nodes(form.field("Téléphone"))[1].props.required, false);
  await form.submit();
  assert.equal(calls.length, 1);
  form.props.smsNotificationsEnabled = true;
  form.render();
  assert.equal(form.field("Téléphone").props.label, "Téléphone *");
  assert.equal(nodes(form.field("Téléphone"))[1].props.required, true);
  await form.submit();
  form.render();
  assert.equal(calls.length, 1);
  assert.match(form.field("Téléphone").props.error, /obligatoire/);
  form.change("Téléphone", "abc");
  await form.submit();
  form.render();
  assert.match(form.field("Téléphone").props.error, /invalide/);
  assert.equal(calls.length, 1);
  form.change("Téléphone", "+32 470 12 34 56");
  await form.submit();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].customerPhone, "+32 470 12 34 56");
});

test("formulaire partagé : double clic bloqué et même clé pour un retry après échec", async () => {
  const calls = [];
  let finish;
  const form = formFixture((payload) => {
    calls.push(payload);
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = form.submit();
  await form.submit();
  assert.equal(calls.length, 1);
  finish(false);
  await first;
  const retry = form.submit();
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  finish(false);
  await retry;
  form.change("Téléphone", "0612345678");
  const changed = form.submit();
  assert.notEqual(calls[1].idempotencyKey, calls[2].idempotencyKey);
  finish(true);
  await changed;
});

test("dashboard et webapp : le formulaire reçoit le flag SMS enregistré du restaurant", () => {
  for (const file of [
    resolve(base, "add.take-away.component.js"),
    resolve(base, "../webapp/take-away/add.take-away.webapp.js"),
  ]) {
    const restaurant = { _id: "restaurant-1", takeAwaySettings: { smsNotifications: { enabled: false } } };
    const harness = componentHarness(file, { restaurantContext: { restaurantData: restaurant } });
    const manual = () => nodes(harness.render()).find((node) => node.type === "ManualOrder");
    assert.equal(manual().props.smsNotificationsEnabled, false);
    restaurant.takeAwaySettings.smsNotifications.enabled = true;
    assert.equal(manual().props.smsNotificationsEnabled, true);
  }
});
