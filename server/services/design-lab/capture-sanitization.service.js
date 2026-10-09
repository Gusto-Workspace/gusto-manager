/* global document, window, getComputedStyle */
const { randomUUID } = require("crypto");
const SANITIZATION_VERSION = 3;
const SANITIZATION_BUDGET_MS = 15000;

// Runs in each browser frame. Marks only identified consent roots/actions/backdrops;
// it never changes CSS, site classes, or arbitrary fixed/dialog elements.
function inspectConsentDOM({ token, remove = false }) {
  if (!document.body || !window.innerWidth || !window.innerHeight)
    return {
      roots: 0,
      pending: 0,
      actions: [],
      details: [],
      removed: 0,
      cmpOnly: false,
    };
  const known =
    /onetrust|ot-sdk|cookiebot|cybotcookiebot|didomi|cookie[-_ ]?(?:consent|banner|modal|notice|law|widget)|iubenda-cs|sp_message|qc-cmp|usercentrics|cmpbox|cmp[-_](?:container|dialog|widget)|privacy-manager/i;
  const family = (value) =>
    (value.match(
      /onetrust|ot-sdk|cookiebot|cybotcookiebot|didomi|iubenda|sp_message|qc-cmp|usercentrics|cmpbox/i,
    ) || [])[0]
      ?.toLowerCase()
      .replace(/ot-sdk/, "onetrust")
      .replace(/cybotcookiebot/, "cookiebot");
  const normalized = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const accept = (value) =>
    /^(?:(?:tout|tous|toutes) accepter|accepter(?: (?:tout|tous|toutes|les cookies|tous les cookies))?|j'accepte(?: (?:tout|les cookies|tous les cookies))?|(?:i )?accept(?: all(?: cookies)?| cookies)?|allow all(?: cookies)?|agree(?: to all)?|i agree|accetta(?: tutti(?: i cookie)?| i cookie)?|consenti(?: tutto| tutti)?)[.!\s]*$/i.test(
      normalized(value).replace(
        /(?: et continuer| et fermer| and continue| and close| e continua)[.!]*$/,
        "",
      ),
    );
  const name = (node) =>
    `${node.id || ""} ${typeof node.className === "string" ? node.className : ""} ${[
      ...node.attributes,
    ]
      .filter((attr) =>
        /^data-(?:cmp|cookie|consent|onetrust|didomi|usercentrics)/i.test(
          attr.name,
        ),
      )
      .map((attr) => `${attr.name} ${attr.value.slice(0, 80)}`)
      .join(" ")}`;
  const geometry = (node) => {
    const rect = node.getBoundingClientRect();
    const width = Math.max(
      0,
      Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left),
    );
    const height = Math.max(
      0,
      Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
    );
    return {
      rect,
      area: (width * height) / (window.innerWidth * window.innerHeight),
      width,
      height,
    };
  };
  const visible = (node) => {
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) < 0.02 ||
      geometry(node).area === 0
    )
      return false;
    for (
      let ancestor = node.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const parentStyle = getComputedStyle(ancestor);
      if (
        parentStyle.display === "none" ||
        parentStyle.visibility === "hidden" ||
        Number(parentStyle.opacity) < 0.02
      )
        return false;
    }
    return true;
  };
  const stack = (node) => {
    let zIndex = 0,
      positioned = false;
    for (
      let ancestor = node;
      ancestor && ancestor !== document.body;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      positioned ||= ["fixed", "sticky"].includes(style.position);
      if (style.position !== "static")
        zIndex = Math.max(zIndex, parseInt(style.zIndex, 10) || 0);
    }
    return { zIndex, positioned };
  };
  const elements = [];
  const collect = (scope) => {
    for (const node of scope.querySelectorAll("*")) {
      elements.push(node);
      if (node.shadowRoot) collect(node.shadowRoot);
    }
  };
  collect(document.body);
  const roots = elements
    .filter((node) => {
      if (
        ["SCRIPT", "STYLE", "BUTTON", "A", "IFRAME", "INPUT", "SVG"].includes(
          node.tagName,
        ) ||
        !visible(node)
      )
        return false;
      const identifier = name(node),
        isKnown = known.test(identifier);
      if (
        !isKnown &&
        (node.matches("header, nav, main, footer") ||
          node.querySelector("main, nav"))
      )
        return false;
      const text = normalized(node.innerText).slice(0, 8000);
      const cookieText =
        /\bcookies?\b|\bconsent(?:ement)?\b|\bstatistiques?\b|\bpreferences?\b|privacy preferences|preferences de confidentialite/.test(
          text,
        );
      const hasAccept = [
        ...node.querySelectorAll(
          'button, a, [role="button"], input[type="button"], input[type="submit"]',
        ),
      ].some((button) =>
        accept(
          button.getAttribute("aria-label") || button.innerText || button.value,
        ),
      );
      const explicitAcceptAll = [
        ...node.querySelectorAll('button, a, [role="button"]'),
      ].some((button) =>
        /^(?:accept all|allow all|tout accepter|accepter tous|accetta tutti|consenti tutti)/.test(
          normalized(button.innerText || button.getAttribute("aria-label")),
        ),
      );
      const consentCopy =
        /(?:we|this (?:site|website)|our (?:site|website)).{0,25}use.{0,20}cookies|nous utilisons.{0,20}cookies|ce site utilise.{0,20}cookies|uses? cookies|cookie(?:s)? preferences|cookies?.{0,100}(?:experience|tracking|analytics|consent|utilis|personnalis|mesure|preferenc)|en cliquant sur accepter.{0,150}(?:cookies?|consent|statistiques?|preferences?)|privacy preferences|preferences de confidentialite|we value your privacy/.test(
          text,
        );
      const verifiedFrame = [
        ...node.querySelectorAll("iframe[data-gusto-cmp-frame]"),
      ].some((frame) => frame.getAttribute("data-gusto-cmp-frame") === token);
      const dialog = node.matches(
        'dialog[open], [role="dialog"], [aria-modal="true"]',
      );
      const { positioned, zIndex } = stack(node);
      // A privacy link in a newsletter or the site footer is insufficient evidence.
      return (
        (positioned || dialog) &&
        ((isKnown &&
          (cookieText || hasAccept || /consent|privacy/i.test(identifier))) ||
          (verifiedFrame && !text) ||
          (cookieText &&
            hasAccept &&
            (explicitAcceptAll || consentCopy) &&
            (dialog || positioned || zIndex >= 50)))
      );
    })
    .filter(
      (node, _index, candidates) =>
        !candidates.some((parent) => parent !== node && parent.contains(node)),
    );

  const mark = (node, kind, index) => {
    const attribute = `data-gusto-cmp-${kind}`;
    if (!node.getAttribute(attribute)?.startsWith(token))
      node.setAttribute(attribute, `${token}-${kind}-${index}`);
    return node.getAttribute(attribute);
  };
  const backdrops = elements.filter((node) => {
    if (
      !visible(node) ||
      geometry(node).area < 0.5 ||
      !/backdrop|overlay|dark-filter|dimmer|mask/i.test(name(node))
    )
      return false;
    const info = stack(node);
    return roots.some((root) => {
      const rootFamily = family(name(root));
      if (rootFamily && family(name(node)) === rootFamily) return true;
      const sibling =
        root.parentElement === node.parentElement &&
        (root.previousElementSibling === node ||
          root.nextElementSibling === node);
      const rootZ = stack(root).zIndex;
      return (
        sibling &&
        info.positioned &&
        info.zIndex > 0 &&
        info.zIndex <= rootZ &&
        rootZ - info.zIndex <= 10
      );
    });
  });
  backdrops.forEach((node, i) => mark(node, "backdrop", i));
  const actions = [];
  roots.forEach((root, i) => {
    mark(root, "root", i);
    for (const node of root.querySelectorAll(
      'button, a, [role="button"], input[type="button"], input[type="submit"]',
    )) {
      const label =
        node.getAttribute("aria-label") || node.innerText || node.value || "";
      if (visible(node) && accept(label))
        actions.push({
          key: mark(node, "action", actions.length),
          label: label.trim().slice(0, 120),
        });
    }
  });
  const previouslyMarkedBackdrops = elements.filter(
    (node) =>
      node.getAttribute("data-gusto-cmp-backdrop")?.startsWith(token) &&
      visible(node),
  );
  const pending = roots.length + previouslyMarkedBackdrops.length;
  if (remove) {
    const removable = [...new Set([...roots, ...previouslyMarkedBackdrops])];
    removable.forEach((node) => node.remove());
    return {
      roots: roots.length,
      pending,
      actions,
      removed: removable.length,
      remainingText: document.body?.innerText?.trim().slice(0, 1000) || "",
    };
  }
  return {
    roots: roots.length,
    pending,
    actions,
    removed: 0,
    details: roots
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: (node.id || "").slice(0, 100),
        className: (typeof node.className === "string"
          ? node.className
          : ""
        ).slice(0, 160),
        position: getComputedStyle(node).position,
        zIndex: stack(node).zIndex,
        areaRatio: geometry(node).area,
        reason: "remaining_cmp",
      }))
      .slice(0, 8),
    cmpOnly:
      roots.length > 0 &&
      normalized(document.body?.innerText) ===
        normalized(roots.map((root) => root.innerText).join(" ")),
  };
}

// Independent from CMP recognition: never removes these nodes. A normal compact
// navbar is excluded, while unknown obstructing dialogs/backdrops stop capture.
function inspectBlockingOverlays() {
  if (!document.body || !window.innerWidth || !window.innerHeight) return [];
  const viewportArea = window.innerWidth * window.innerHeight;
  const blockers = [];
  const elements = [];
  const collect = (scope) => {
    for (const node of scope.querySelectorAll("*")) {
      elements.push(node);
      if (node.shadowRoot) collect(node.shadowRoot);
    }
  };
  collect(document.body);
  for (const node of elements) {
    if (
      ["SCRIPT", "STYLE", "IMG", "VIDEO", "SVG", "CANVAS"].includes(
        node.tagName,
      )
    )
      continue;
    const style = getComputedStyle(node);
    const dialog = node.matches(
      'dialog[open], [role="dialog"], [aria-modal="true"]',
    );
    const identifier = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""}`;
    const backdrop = /backdrop|overlay|dark-filter|dimmer|modal-mask/i.test(
      identifier,
    );
    const positioned = ["fixed", "sticky"].includes(style.position);
    if (
      (!dialog && !positioned && !backdrop) ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) < 0.02
    )
      continue;
    let zIndex = parseInt(style.zIndex, 10) || 0,
      hidden = false;
    for (
      let parent = node.parentElement;
      parent && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      const parentStyle = getComputedStyle(parent);
      if (
        parentStyle.display === "none" ||
        parentStyle.visibility === "hidden" ||
        Number(parentStyle.opacity) < 0.02
      )
        hidden = true;
      if (parentStyle.position !== "static")
        zIndex = Math.max(zIndex, parseInt(parentStyle.zIndex, 10) || 0);
    }
    if (hidden) continue;
    const rect = node.getBoundingClientRect();
    const width = Math.max(
      0,
      Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left),
    );
    const height = Math.max(
      0,
      Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
    );
    const areaRatio = (width * height) / viewportArea;
    if (
      node.matches('nav, header, [role="navigation"], [role="banner"]') &&
      !dialog &&
      height <= window.innerHeight * 0.22
    )
      continue;
    const reason =
      dialog && areaRatio >= 0.18
        ? "large_dialog"
        : backdrop && areaRatio >= 0.5 && (zIndex >= 10 || positioned)
          ? "viewport_backdrop"
          : positioned && zIndex >= 50 && areaRatio >= 0.22
            ? "large_fixed_overlay"
            : "";
    if (!reason) continue;
    // A fixed layer behind the page content is not obstructing it. Backdrops with
    // pointer-events:none are still visually obstructing and remain detectable.
    let exposed = 0;
    for (const fx of [0.2, 0.5, 0.8])
      for (const fy of [0.2, 0.5, 0.8]) {
        const x = Math.max(0, rect.left) + width * fx,
          y = Math.max(0, rect.top) + height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (node === hit || node.contains(hit))) exposed++;
      }
    if (!exposed && !dialog && !(backdrop && style.pointerEvents === "none"))
      continue;
    blockers.push({
      tag: node.tagName.toLowerCase(),
      id: (node.id || "").slice(0, 100),
      className: (typeof node.className === "string"
        ? node.className
        : ""
      ).slice(0, 160),
      position: style.position,
      zIndex,
      areaRatio: Math.round(areaRatio * 1000) / 1000,
      reason,
    });
  }
  return blockers.slice(0, 8);
}

function capturesAreClean(reference) {
  const trace = reference.captureSanitization;
  return (
    !["blocked_by_overlay", "blocked_by_popup"].includes(reference.status) &&
    trace?.version === SANITIZATION_VERSION &&
    trace.qualityPassed === true &&
    trace.blockingOverlayDetected === false &&
    Boolean(trace.sanitizedAt)
  );
}

async function sanitizeStructuralCapture(
  page,
  deadline,
  { pass = 0, rewarm = true } = {},
) {
  const {
    warmUpPortfolioPage,
    waitForPortfolioImages,
  } = require("./portfolio-capture.service");
  const token = randomUUID();
  const end = Math.min(deadline, Date.now() + SANITIZATION_BUDGET_MS);
  const trace = {
    version: SANITIZATION_VERSION,
    consentDetected: false,
    consentAction: "none",
    consentLabel: "",
    blockingOverlayDetected: false,
    blockingOverlays: [],
    qualityPassed: false,
  };
  const frames = () => page.frames().slice(0, 20);
  const scan = async () => {
    const states = [];
    for (const frame of frames()) {
      try {
        const state = await frame.evaluate(inspectConsentDOM, { token });
        if (state.cmpOnly && frame !== page.mainFrame()) {
          const element = await frame.frameElement();
          await element.evaluate(
            (node, marker) => node.setAttribute("data-gusto-cmp-frame", marker),
            token,
          );
        }
        trace.consentDetected ||= state.roots > 0;
        trace.consentHasBackdrop ||= state.pending > state.roots;
        states.push({ frame, state });
      } catch (error) {
        if (!frame.isDetached()) throw error;
      }
    }
    return states;
  };
  let states = await scan();
  const preferences = require('./structural-consent-preferences.service');
  // Observe the consent interface while it still exists; retain only generic
  // semantic/event provenance for its subsequently exposed preferences button.
  await preferences.observeConsentPreferences(page,{token,mode:'sources',deadline:end});
  let clicks = 0;
  for (const { frame, state } of states) {
    for (const action of state.actions) {
      if (++clicks > 3 || Date.now() >= end) break;
      try {
        await frame
          .locator(`[data-gusto-cmp-action="${action.key}"]`)
          .click({ timeout: Math.max(1, Math.min(1200, end - Date.now())) });
        trace.consentAction = "clicked";
        trace.consentLabel = action.label;
        const settleEnd = Math.min(end, Date.now() + 1800);
        do {
          await page.waitForTimeout(
            Math.min(200, Math.max(1, settleEnd - Date.now())),
          );
          states = await scan();
        } while (
          states.some((item) => item.state.pending) &&
          Date.now() < settleEnd
        );
        if (!states.some((item) => item.state.pending)) break;
      } catch (error) {
        if (frame.isDetached()) {
          // Some CMPs remove their iframe synchronously during the click.
          trace.consentAction = "clicked";
          trace.consentLabel = action.label;
          break;
        }
        // An unclickable/disabled acceptance control falls back only to reliable CMP nodes.
      }
    }
  }
  states = await scan();
  for (const { frame, state } of states) {
    if (!state.pending || frame.isDetached()) continue;
    let result;
    try {
      result = await frame.evaluate(inspectConsentDOM, { token, remove: true });
    } catch (error) {
      if (frame.isDetached()) continue;
      throw error;
    }
    if (result.removed) {
      trace.consentAction = "removed";
      trace.consentLabel ||= state.actions[0]?.label || "CMP identifié";
      // An emptied CMP iframe is an associated presentation wrapper, not page content.
      if (frame !== page.mainFrame() && !result.remainingText) {
        const element = await frame.frameElement();
        await element.evaluate((node) => node.remove());
      }
    }
  }
  const popup =
    await require("./popup-sanitization.service").dismissStructuralPopups(
      page,
      deadline,
    );
  Object.assign(trace, {
    popupDetected: popup.popupDetected,
    popupDismissed: popup.popupDismissed,
    popupActions: popup.popupActions,
  });
  if (rewarm && (trace.consentAction !== "none" || popup.popupDismissed)) {
    // Consent often unlocks scrolling/lazy rendering: warm up again normally.
    await warmUpPortfolioPage(page, deadline);
    const imageState = await waitForPortfolioImages(page, deadline, {
      visibleOnly: true,
    });
    if (imageState.failed || imageState.pending)
      throw Object.assign(
        new Error("Images non chargées après nettoyage du consentement."),
        { status: 422 },
      );
  }
  await page.waitForTimeout(Math.max(1, Math.min(300, deadline - Date.now())));
  // Certify and temporarily mask only an orphaned backdrop associated with a
  // hidden consent interface before the unchanged blocking-overlay gate.
  await require('./structural-consent-backdrop.service').maskCertifiedConsentBackdrops(page);
  for (const frame of frames()) {
    try {
      const blockers = await frame.evaluate(inspectBlockingOverlays);
      const remainingConsent = await frame.evaluate(inspectConsentDOM, {
        token,
      });
      let scale = 1;
      if (frame !== page.mainFrame()) {
        const box = await (await frame.frameElement()).boundingBox();
        const viewport = page.viewportSize();
        scale =
          box && viewport
            ? Math.min(
                1,
                (Math.max(
                  0,
                  Math.min(viewport.width, box.x + box.width) -
                    Math.max(0, box.x),
                ) *
                  Math.max(
                    0,
                    Math.min(viewport.height, box.y + box.height) -
                      Math.max(0, box.y),
                  )) /
                  (viewport.width * viewport.height),
              )
            : 0;
      }
      trace.blockingOverlays.push(
        ...blockers
          .filter((blocker) => blocker.areaRatio * scale >= 0.18)
          .map((blocker) => ({
            ...blocker,
            frame: frame === page.mainFrame() ? "main" : "iframe",
          })),
      );
      trace.blockingOverlays.push(
        ...remainingConsent.details
          .filter((blocker) => blocker.areaRatio * scale > 0)
          .map((blocker) => ({
            ...blocker,
            frame: frame === page.mainFrame() ? "main" : "iframe",
          })),
      );
    } catch (error) {
      if (!frame.isDetached()) throw error;
    }
  }
  trace.blockingOverlays = trace.blockingOverlays.slice(0, 8);
  trace.cookieOverlayDetected = trace.consentDetected;
  const remainingCookie = trace.blockingOverlays.some(
    (overlay) => overlay.reason === "remaining_cmp",
  );
  if (remainingCookie && pass < 1 && trace.consentAction === "none") {
    const retried = await sanitizeStructuralCapture(page, deadline, {
      pass: pass + 1,
      rewarm,
    });
    retried.captureSanitization.popupDetected ||= trace.popupDetected;
    retried.captureSanitization.popupDismissed ||= trace.popupDismissed;
    retried.captureSanitization.popupActions = [
      ...trace.popupActions,
      ...retried.captureSanitization.popupActions,
    ].slice(-8);
    return retried;
  }
  trace.cookieOverlayDismissed = trace.consentDetected && !remainingCookie;
  trace.consentMethod =
    trace.consentAction === "clicked"
      ? "click"
      : trace.consentAction === "removed"
        ? "dom_fallback"
        : "none";
  trace.blockingOverlays.push(...popup.remainingPopups);
  trace.blockingOverlays = trace.blockingOverlays.slice(0, 8);
  trace.blockingOverlayDetected = trace.blockingOverlays.length > 0;
  trace.qualityPassed = !trace.blockingOverlayDetected;
  trace.sanitizedAt = new Date();
  if (!trace.qualityPassed)
    throw Object.assign(
      new Error(
        popup.remainingPopups.length
          ? "Popup non neutralisée — analyse non lancée."
          : "Overlay bloquant détecté — analyse non lancée.",
      ),
      {
        status: 422,
        code: popup.remainingPopups.length
          ? "blocked_by_popup"
          : "blocked_by_overlay",
        captureSanitization: trace,
      },
    );
  trace.consentPreferences=await preferences.observeConsentPreferences(page,{token,mode:'controls',deadline:end});
  page.structuralConsentPreferenceDiagnostic=trace.consentPreferences;
  return { captureSanitization: trace };
}
module.exports = {
  SANITIZATION_VERSION,
  capturesAreClean,
  sanitizeStructuralCapture,
  inspectConsentDOM,
  inspectBlockingOverlays,
};
