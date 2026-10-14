const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../../client/src/components/dashboard/_shared/use-sms-module-toggle.js"), "utf8")
  .replace(/^import.*;\n/gm, "").replace("export default function", "function");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function snapshot(module, enabled, other = false, status = "none", active = true) {
  return { modules: { reservations: other, take_away: other, [module]: enabled },
    commercial: { active, status, canSelfManage: true, periodEnd: "2026-11-01", fixedMonthlyAmount: 9.9 } };
}

// Deferred HTTP and a hook runner with effect dependencies let the assertions
// inspect the render before a response arrives, without mounting an application.
function harness(module, initial, { deferParent = false } = {}) {
  const slots = [], gets = [], posts = [], updates = [];
  let index, dirty, effects, queued;
  const props = { restaurantId: "r", module, enabled: initial.modules[module],
    modules: initial.modules, commercial: initial.commercial, onUpdated };
  function apply(data) {
    props.enabled = data.modules[module];
    props.modules = data.modules;
    props.commercial = data.commercial;
  }
  function onUpdated(data, action) {
    updates.push({ data, action });
    if (deferParent) queued = data;
    else apply(data);
  }
  function request(records, url, body, config) {
    return new Promise((resolve, reject) => records.push({ url, body, config,
      resolve: (data) => resolve({ data }), reject }));
  }
  const context = { process: { env: { NEXT_PUBLIC_API_URL: "mock://api" } }, AbortController,
    globalThis: { crypto: { randomUUID: () => `key-${gets.length}-${posts.length}` } },
    axios: { get: (url, config) => request(gets, url, undefined, config),
      post: (url, body, config) => request(posts, url, body, config) },
    useState(initialValue) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initialValue;
      return [slots[slot], (value) => {
        const next = typeof value === "function" ? value(slots[slot]) : value;
        if (!Object.is(next, slots[slot])) { slots[slot] = next; dirty = true; }
      }];
    },
    useRef(initialValue) {
      const slot = index++;
      return slots[slot] ||= { current: initialValue };
    },
    useEffect(callback, deps) {
      const slot = index++;
      if (slots[slot] && deps.every((value, i) => Object.is(value, slots[slot].deps[i]))) return;
      const previous = slots[slot];
      slots[slot] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[slot].cleanup = callback(); });
    },
  };
  vm.runInNewContext(source + "\nthis.hook = useSmsModuleToggle;", context);
  function render() {
    for (let attempt = 0; attempt < 10; attempt++) {
      index = 0; dirty = false; effects = [];
      const result = context.hook(props);
      effects.forEach((effect) => effect());
      if (!dirty) return result;
    }
    assert.fail("Hook render did not settle");
  }
  return { render, gets, posts, props, updates, applyParent: () => apply(queued) };
}

for (const module of ["reservations", "take_away"]) {
  for (const next of [false, true]) {
    test(`${module}: changement simple vers ${next} immédiat, sans doublon ni rechargement`, async () => {
      const h = harness(module, snapshot(module, !next, true));
      const handler = h.render();
      const done = handler.changeModule(next);
      handler.changeModule(next);
      handler.changeModule(!next);
      assert.equal(h.render().enabled, next);
      assert.equal(h.render().loading, true);
      assert.match(h.render().statusText, /en cours/);
      assert.equal(h.props.enabled, !next, "le paramètre reste confirmé par l’API");
      assert.equal(h.posts.length, 1);
      assert.equal(h.posts[0].body.confirm, false);
      assert.equal(h.gets.length, 0);
      h.posts[0].resolve(snapshot(module, next, true));
      await done;
      assert.equal(h.render().enabled, next);
      assert.equal(h.render().loading, false);
      assert.equal(h.gets.length, 0);
    });
  }

  test(`${module}: synchronisation différée du parent sans retour à l’ancien état`, async () => {
    const h = harness(module, snapshot(module, false, true), { deferParent: true });
    const done = h.render().changeModule(true);
    h.posts[0].resolve(snapshot(module, true, true));
    await done;
    assert.equal(h.props.enabled, false);
    assert.equal(h.render().enabled, true);
    h.applyParent();
    assert.equal(h.render().enabled, true);
  });

  test(`${module}: dernier module, modale immédiate et annulation sans mutation`, async () => {
    const h = harness(module, snapshot(module, true));
    const handler = h.render();
    const done = handler.changeModule(false);
    handler.changeModule(false);
    assert.equal(h.render().pending.action, "schedule_deactivation");
    assert.equal(h.render().preparing, true);
    assert.equal(h.render().enabled, true);
    h.render().confirm();
    assert.equal(h.posts.length, 0);
    // Even a callback from the render preceding the click may close a preview.
    handler.close();
    assert.equal(h.gets[0].config.signal.aborted, true);
    h.gets[0].resolve(snapshot(module, true));
    await done;
    assert.equal(h.render().pending, null);
    assert.equal(h.render().enabled, true);
    assert.equal(h.posts.length, 0);
    assert.equal(h.updates.length, 0);
  });

  test(`${module}: confirmation, désactivation visuelle immédiate et succès commercial validé`, async () => {
    const h = harness(module, snapshot(module, true));
    const quote = h.render().changeModule(false);
    h.gets[0].resolve(snapshot(module, true));
    await quote;
    const handler = h.render();
    const done = handler.confirm();
    handler.confirm();
    handler.close();
    assert.equal(h.render().enabled, false);
    assert.equal(h.render().confirming, true);
    assert.equal(h.render().pending.action, "schedule_deactivation");
    assert.equal(h.props.commercial.status, "none");
    assert.equal(h.posts.length, 1);
    assert.equal(h.posts[0].body.confirm, true);
    assert.equal(h.posts[0].body.confirmedAction, "schedule_deactivation");
    h.posts[0].resolve(snapshot(module, false, false, "scheduled"));
    await done;
    assert.equal(h.render().enabled, false);
    assert.equal(h.render().pending, null);
    assert.equal(h.props.commercial.status, "scheduled");
  });

  test(`${module}: réactivation programmée, attente de confirmation et abonnement inchangé`, async () => {
    const initial = snapshot(module, false, false, "scheduled");
    const h = harness(module, initial);
    const quote = h.render().changeModule(true);
    assert.equal(h.render().pending.action, "cancel_deactivation");
    assert.equal(h.render().enabled, false);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    assert.equal(h.render().enabled, true);
    assert.match(h.render().statusText, /Activation en cours/);
    assert.equal(h.props.commercial.status, "scheduled");
    assert.equal(h.updates.at(-1).action, undefined);
    assert.equal(h.posts[0].body.confirmedAction, "cancel_deactivation");
    h.posts[0].resolve(snapshot(module, true));
    await done;
    assert.equal(h.props.commercial.status, "none");
    assert.equal(h.updates.at(-1).action, "cancel_deactivation");
    assert.equal(h.props.modules[module === "reservations" ? "take_away" : "reservations"], false);
  });

  test(`${module}: abonnement terminé, le toggle attend le parcours commercial existant`, async () => {
    const initial = snapshot(module, false, false, "completed", false);
    const h = harness(module, initial);
    const quote = h.render().changeModule(true);
    assert.equal(h.render().pending.action, "reactivate");
    assert.equal(h.render().enabled, false);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    assert.equal(h.render().enabled, true);
    assert.equal(h.props.commercial.active, false);
    assert.equal(h.posts[0].body.confirmedAction, "reactivate");
    h.posts[0].resolve(snapshot(module, true));
    await done;
    assert.equal(h.props.commercial.active, true);
  });

  test(`${module}: échec API, restauration et réconciliation avant de libérer le toggle`, async () => {
    const initial = snapshot(module, true, true);
    const h = harness(module, initial);
    const done = h.render().changeModule(false);
    h.posts[0].reject({ response: { data: { message: "Erreur API simulée" } } });
    await tick();
    assert.equal(h.render().enabled, true);
    assert.equal(h.render().error, "Erreur API simulée");
    assert.equal(h.render().loading, true);
    h.render().changeModule(false);
    assert.equal(h.posts.length, 1);
    assert.match(h.gets[0].url, module === "reservations" ? /sms-reminders$/ : /take-away\/sms-notifications$/);
    h.gets[0].resolve(initial);
    await done;
    assert.equal(h.render().enabled, true);
    assert.equal(h.render().loading, false);
    assert.equal(h.render().error, "Erreur API simulée");
  });

  test(`${module}: échec de résiliation, retour à l’état actif et confirmation réessayable`, async () => {
    const initial = snapshot(module, true);
    const h = harness(module, initial);
    const quote = h.render().changeModule(false);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    h.posts[0].reject(new Error("Simulated Stripe failure"));
    await tick();
    assert.equal(h.render().enabled, true);
    h.gets[1].resolve(initial);
    await done;
    assert.equal(h.render().enabled, true);
    assert.ok(h.render().error);
    assert.equal(h.render().pending.applied, undefined);
    const retry = h.render().confirm();
    assert.equal(h.posts[1].body.idempotencyKey, h.posts[0].body.idempotencyKey);
    h.posts[1].resolve(snapshot(module, false, false, "scheduled"));
    await retry;
    assert.equal(h.render().error, "");
  });

  test(`${module}: timeout après mutation, l’état réel remplace le rollback et reste visible`, async () => {
    const initial = snapshot(module, true);
    const h = harness(module, initial);
    const quote = h.render().changeModule(false);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    h.posts[0].reject(new Error("Timeout"));
    await tick();
    h.gets[1].resolve(snapshot(module, false, false, "scheduled"));
    await done;
    assert.equal(h.render().enabled, false);
    assert.equal(h.render().pending.applied, true);
    assert.ok(h.render().error);
    assert.equal(h.updates.at(-1).action, undefined, "pas de fausse annonce de succès");
    h.render().close();
    assert.equal(h.render().enabled, false);
  });

  test(`${module}: état concurrent, la confirmation demandée par le serveur reste obligatoire`, async () => {
    const h = harness(module, snapshot(module, true, true));
    const done = h.render().changeModule(false);
    assert.equal(h.render().enabled, false);
    h.posts[0].resolve({ ...snapshot(module, true), confirmationRequired: "schedule_deactivation" });
    await done;
    assert.equal(h.render().enabled, true);
    assert.equal(h.render().pending.action, "schedule_deactivation");
    h.render().close();
    assert.equal(h.render().enabled, true);
  });

  test(`${module}: vérification commerciale en échec, aucun POST avant le nouvel essai`, async () => {
    const initial = snapshot(module, true);
    const h = harness(module, initial);
    const quote = h.render().changeModule(false);
    h.gets[0].reject(new Error("Preview unavailable"));
    await quote;
    assert.equal(h.render().enabled, true);
    assert.equal(h.render().pending.ready, false);
    const retry = h.render().confirm();
    assert.equal(h.posts.length, 0);
    h.gets[1].resolve(initial);
    await retry;
    assert.equal(h.render().pending.ready, true);
    h.render().close();
    assert.equal(h.posts.length, 0);
  });

  test(`${module}: changement de restaurant ignore une ancienne réponse`, async () => {
    const h = harness(module, snapshot(module, true, true));
    const done = h.render().changeModule(false);
    h.props.restaurantId = "other_restaurant";
    h.render();
    h.posts[0].resolve(snapshot(module, false, true));
    await done;
    assert.equal(h.render().enabled, true);
    assert.equal(h.updates.length, 0);
    assert.equal(h.render().loading, false);
  });

  test(`${module}: échec d’annulation de résiliation, activation restaurée à false`, async () => {
    const initial = snapshot(module, false, false, "scheduled");
    const h = harness(module, initial);
    const quote = h.render().changeModule(true);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    assert.equal(h.render().enabled, true);
    h.posts[0].reject(new Error("Cancellation failed"));
    await tick();
    assert.equal(h.render().enabled, false);
    h.gets[1].resolve(initial);
    await done;
    assert.equal(h.props.commercial.status, "scheduled");
    assert.equal(h.render().enabled, false);
    assert.ok(h.render().error);
    h.render().close();
    assert.equal(h.render().enabled, false);
  });

  test(`${module}: réconciliation indisponible, rollback conservé et erreur explicite`, async () => {
    const h = harness(module, snapshot(module, false, true));
    const done = h.render().changeModule(true);
    h.posts[0].reject(new Error("Network error"));
    await tick();
    h.gets[0].reject(new Error("Network still unavailable"));
    await done;
    assert.equal(h.render().enabled, false);
    assert.match(h.render().error, /L’état enregistré n’a pas pu être vérifié/);
    assert.equal(h.render().loading, false);
  });

  test(`${module}: avenant en attente, état enregistré conservé et même clé au nouvel essai`, async () => {
    const initial = snapshot(module, true);
    const h = harness(module, initial);
    const quote = h.render().changeModule(false);
    h.gets[0].resolve(initial);
    await quote;
    const done = h.render().confirm();
    h.posts[0].resolve({ ...snapshot(module, false, false, "scheduled"), documentPending: true });
    await done;
    assert.equal(h.render().enabled, false);
    assert.equal(h.render().pending.applied, true);
    const retry = h.render().confirm();
    assert.equal(h.posts[1].body.idempotencyKey, h.posts[0].body.idempotencyKey);
    h.posts[1].resolve(snapshot(module, false, false, "scheduled"));
    await retry;
    assert.equal(h.render().enabled, false);
    assert.equal(h.render().pending, null);
  });
}

test("les deux interfaces affichent l’état visuel et distinguent préparation et confirmation", () => {
  for (const path of ["_shared/reservations/sms-reminders.reservations.component.js", "take-away/sms-notifications.take-away.component.js"]) {
    const component = fs.readFileSync(require.resolve(`../../client/src/components/dashboard/${path}`), "utf8");
    assert.match(component, /checked=\{activation.enabled\}/);
    assert.match(component, /aria-busy=\{activation.loading\}/);
    assert.match(component, /loading=\{activation.confirming\} preparing=\{activation.preparing\}/);
    assert.match(component, /role="status"/);
  }
  const modal = fs.readFileSync(require.resolve("../../client/src/components/dashboard/_shared/sms-subscription-action-modal.component.js"), "utf8");
  assert.match(modal, /disabled=\{loading \|\| preparing\} onClick=\{onConfirm\}/);
  assert.match(modal, /disabled=\{loading\} onClick=\{onClose\}/);
});
