/* global document, innerWidth, innerHeight, getComputedStyle */
const { randomUUID } = require("crypto");

function inspectPopupDOM({ token, remove = false }) {
  if (!document.body)
    return { roots: [], actions: [], pending: 0, popupOnly: false };
  const nodes = [];
  const collect = (scope) => {
    for (const node of scope.querySelectorAll("*")) {
      nodes.push(node);
      if (node.shadowRoot) collect(node.shadowRoot);
    }
  };
  collect(document.body);
  const name = (node) =>
    `${node.id || ""} ${typeof node.className === "string" ? node.className : ""}`;
  const rectInfo = (node) => {
    const rect = node.getBoundingClientRect(),
      style = getComputedStyle(node);
    const area =
      (Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) *
        Math.max(
          0,
          Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top),
        )) /
      (innerWidth * innerHeight);
    let z = parseInt(style.zIndex, 10) || 0,
      fixed = ["fixed", "sticky"].includes(style.position),
      hidden = false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      z = Math.max(z, parseInt(css.zIndex, 10) || 0);
      fixed ||= ["fixed", "sticky"].includes(css.position);
      hidden ||=
        css.display === "none" ||
        css.visibility === "hidden" ||
        Number(css.opacity) < 0.02;
    }
    return { rect, style, area, z, fixed, visible: !hidden && area > 0 };
  };
  const close = (node) =>
    /^(?:close(?: (?:popup|modal|dialog))?|dismiss|fermer|chiudi|cerrar|×|✕|✖|x|no thanks|not now|non merci|plus tard|maybe later|continue to (?:site|website))\s*[.!]*$/i.test(
      (
        node.getAttribute("aria-label") ||
        node.innerText ||
        node.getAttribute("title") ||
        ""
      ).trim(),
    ) || /(?:^|[-_ ])(?:close|dismiss)(?:$|[-_ ])/i.test(name(node));
  const controls = (node) =>
    [...node.querySelectorAll('button,a,[role="button"]')].filter(
      (button) => rectInfo(button).visible && close(button),
    );
  const candidates = nodes
    .filter((node) => {
      if (
        node.matches(
          'header,nav,main,footer,[role="navigation"],[role="banner"],button,a,input,svg,iframe',
        ) ||
        node.querySelector('main,nav,[role="navigation"]')
      )
        return false;
      if (
        /onetrust|cookiebot|didomi|iubenda|cookie[-_ ]?(?:consent|banner|modal|notice)|usercentrics/i.test(
          name(node),
        ) ||
        node.hasAttribute("data-gusto-cmp-root") ||
        node.querySelector("[data-gusto-cmp-root]")
      )
        return false;
      if (/(?:^|[-_ ])(?:menu|navigation|navbar)(?:$|[-_ ])/i.test(name(node)))
        return false;
      const info = rectInfo(node);
      if (!info.visible || info.area < 0.01) return false;
      const dialog = node.matches(
        'dialog[open],[role="dialog"],[aria-modal="true"]',
      );
      const knownPopup =
        /popup|modal|interstitial|(?:announcement|newsletter|marketing|event)[-_ ](?:dialog|overlay|notice)/i.test(
          name(node),
        );
      const verifiedFrame = [
        ...node.querySelectorAll("iframe[data-gusto-popup-frame]"),
      ].some((frame) => frame.getAttribute("data-gusto-popup-frame") === token);
      const positioned =
        info.fixed ||
        (info.style.position === "absolute" && info.z >= 50) ||
        (dialog && node.matches(":modal"));
      if (!positioned) return false;
      const centered =
        Math.abs((info.rect.left + info.rect.right) / 2 - innerWidth / 2) <
        innerWidth * 0.3;
      const marketing =
        /newsletter|subscribe|sign up|announcement|discover more|limited time|special offer|event|promotion|annonce|inscri|temporaire/i.test(
          node.innerText || "",
        );
      return (
        dialog ||
        (knownPopup && (controls(node).length || info.area >= 0.12)) ||
        (verifiedFrame && !node.innerText?.trim()) ||
        (marketing &&
          controls(node).length > 0 &&
          centered &&
          info.area >= 0.12 &&
          info.z >= 50)
      );
    })
    .filter(
      (node, _i, all) =>
        !all.some((parent) => parent !== node && parent.contains(node)),
    );
  const actions = [],
    roots = [];
  const marked = (node, kind, i) => {
    const attr = `data-gusto-popup-${kind}`;
    if (!node.getAttribute(attr)?.startsWith(token))
      node.setAttribute(attr, `${token}-${kind}-${i}`);
    return node.getAttribute(attr);
  };
  candidates.forEach((node, i) => {
    const info = rectInfo(node);
    const backdrops = nodes.filter((other) => {
      if (other === node || !/backdrop|overlay|dimmer|mask/i.test(name(other)))
        return false;
      const data = rectInfo(other);
      if (!data.visible || data.area < 0.5) return false;
      const adjacent =
        other.parentElement === node.parentElement &&
        (other.nextElementSibling === node ||
          other.previousElementSibling === node);
      return (
        adjacent && data.z > 0 && data.z <= info.z && info.z - data.z <= 20
      );
    });
    backdrops.forEach((backdrop, j) =>
      marked(backdrop, "backdrop", `${i}-${j}`),
    );
    const hasBackdrop = backdrops.length > 0 || info.area >= 0.8;
    roots.push({
      key: marked(node, "root", i),
      tag: node.tagName.toLowerCase(),
      id: (node.id || "").slice(0, 100),
      className: name(node).slice(0, 160),
      position: info.style.position,
      zIndex: info.z,
      areaRatio: Math.round(info.area * 1000) / 1000,
      reason: "remaining_popup",
      hasBackdrop,
    });
    for (const button of controls(node))
      actions.push({
        key: marked(button, "action", actions.length),
        hasBackdrop,
      });
  });
  const backdrops = nodes.filter(
    (node) =>
      node.getAttribute("data-gusto-popup-backdrop")?.startsWith(token) &&
      rectInfo(node).visible,
  );
  if (remove) {
    [...new Set([...candidates, ...backdrops])].forEach((node) =>
      node.remove(),
    );
  }
  return {
    roots,
    actions,
    pending: candidates.length + backdrops.length,
    popupOnly:
      candidates.length > 0 &&
      document.body.innerText.trim() ===
        candidates
          .map((node) => node.innerText)
          .join(" ")
          .trim(),
  };
}

async function dismissStructuralPopups(page, deadline) {
  const token = randomUUID();
  const end = Math.min(deadline, Date.now() + 12000);
  const trace = {
    popupDetected: false,
    popupDismissed: false,
    popupActions: [],
  };
  const scan = async () => {
    const states = [];
    for (const frame of page.frames().slice(0, 20)) {
      try {
        const state = await frame.evaluate(inspectPopupDOM, { token });
        if (state.popupOnly && frame !== page.mainFrame())
          await (
            await frame.frameElement()
          ).evaluate(
            (node, value) => node.setAttribute("data-gusto-popup-frame", value),
            token,
          );
        trace.popupDetected ||= state.roots.length > 0;
        states.push({ frame, state });
      } catch (error) {
        if (!frame.isDetached()) throw error;
      }
    }
    return states;
  };
  let states = await scan();
  const settle = async () => {
    const settleEnd = Math.min(end, Date.now() + 1500);
    do {
      await page.waitForTimeout(150);
      states = await scan();
    } while (
      states.some((item) => item.state.pending) &&
      Date.now() < settleEnd
    );
    return !states.some((item) => item.state.pending);
  };
  for (const { frame, state } of states) {
    for (const action of state.actions.slice(0, 3)) {
      if (Date.now() >= end) break;
      try {
        await frame
          .locator(`[data-gusto-popup-action="${action.key}"]`)
          .click({ timeout: Math.max(1, Math.min(1000, end - Date.now())) });
        const success = await settle();
        trace.popupActions.push({
          type: "non_structural_popup",
          method: "click",
          hasBackdrop: action.hasBackdrop,
          success,
        });
        if (success) break;
      } catch (error) {
        if (frame.isDetached()) {
          trace.popupActions.push({
            type: "non_structural_popup",
            method: "click",
            hasBackdrop: action.hasBackdrop,
            success: true,
          });
          break;
        }
      }
    }
  }
  states = await scan();
  if (states.some((item) => item.state.pending)) {
    const hasBackdrop = states.some(
      (item) =>
        item.state.roots.some((root) => root.hasBackdrop) ||
        item.state.pending > item.state.roots.length,
    );
    await page.keyboard.press("Escape");
    const success = await settle();
    trace.popupActions.push({
      type: "non_structural_popup",
      method: "escape",
      hasBackdrop,
      success,
    });
  }
  states = await scan();
  for (const { frame, state } of states) {
    if (!state.pending || frame.isDetached()) continue;
    try {
      await frame.evaluate(inspectPopupDOM, { token, remove: true });
      trace.popupActions.push({
        type: "non_structural_popup",
        method: "dom_fallback",
        hasBackdrop: state.roots.some((root) => root.hasBackdrop),
        success: true,
      });
    } catch (error) {
      if (!frame.isDetached()) throw error;
    }
  }
  await page.waitForTimeout(200);
  states = await scan();
  trace.popupDismissed =
    trace.popupDetected && !states.some((item) => item.state.pending);
  trace.remainingPopups = states.flatMap((item) =>
    item.state.roots.map((root) => ({
      ...root,
      frame: item.frame === page.mainFrame() ? "main" : "iframe",
    })),
  );
  if (trace.remainingPopups.length)
    trace.popupActions.push({
      type: "non_structural_popup",
      method: "dom_fallback",
      hasBackdrop: trace.remainingPopups.some((root) => root.hasBackdrop),
      success: false,
    });
  trace.popupActions = trace.popupActions.slice(-8);
  return trace;
}
module.exports = { inspectPopupDOM, dismissStructuralPopups };
