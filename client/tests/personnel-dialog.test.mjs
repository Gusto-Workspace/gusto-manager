import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import useDialogBackdrop from "../src/components/dashboard/_shared/use-dialog-backdrop.js";

test("les dialogues RH se ferment sur Échap ou sur un geste entièrement extérieur", () => {
  let closed = 0;
  let handlers;
  function Probe() {
    handlers = useDialogBackdrop(() => { closed += 1; });
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  const panel = { getBoundingClientRect: () => ({ left: 10, top: 10, right: 100, bottom: 100 }) };
  const point = (x, target = panel) => ({ target, currentTarget: panel, clientX: x, clientY: 50 });
  handlers.onPointerDown(point(5));
  handlers.onClick(point(5));
  assert.equal(closed, 1);
  for (const [start, end] of [[point(50), point(5)], [point(5), point(50)], [point(50), point(50)], [point(50, {}), point(5)]]) {
    handlers.onPointerDown(start);
    handlers.onClick(end);
  }
  assert.equal(closed, 1);
  let prevented = false;
  handlers.onCancel({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(closed, 2);
});
