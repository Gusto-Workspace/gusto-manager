const https = require("https");
const twilio = require("twilio");
const { DOMParser } = require("@xmldom/xmldom");

function fail(message) { return Object.assign(new Error(message), { status: 400, expose: true }); }
function sipUri(draft) {
  if (!/^[a-zA-Z0-9_.!~*'()%+-]+$/.test(draft?.sipUsername || "") || !/^[a-z0-9-]+\.sip\.twilio\.com$/i.test(draft?.sipDomain || "")) throw fail("Identifiant et domaine SIP requis");
  return `sip:${draft.sipUsername}@${draft.sipDomain}`;
}
function template(draft) {
  const uri = sipUri(draft);
  const response = new twilio.twiml.VoiceResponse();
  response.dial({ timeout: 25 }).sip(uri);
  return { uri, twiml: response.toString() };
}
function functionSource(draft) {
  const { twiml } = template(draft);
  return `exports.handler = (context, event, callback) => {\n  const response = new Twilio.Response();\n  response.appendHeader("Content-Type", "text/xml; charset=utf-8");\n  response.setBody(${JSON.stringify(twiml)});\n  return callback(null, response);\n};\n`;
}
function validateResponse(xml, expectedUri) {
  if (typeof xml !== "string" || Buffer.byteLength(xml) > 65536 || /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) return false;
  try {
    const doc = new DOMParser({ onError: () => { throw new Error("invalid XML"); } }).parseFromString(xml, "application/xml");
    const root = doc.documentElement;
    const elements = (node) => Array.from(node.childNodes).filter((child) => child.nodeType === 1);
    const cleanText = (node) => Array.from(node.childNodes).every((child) => child.nodeType === 1 || child.nodeType === 3 && !child.data.trim());
    if (root?.tagName !== "Response" || root.namespaceURI || !cleanText(root) || elements(root).length !== 1) return false;
    const dial = elements(root)[0];
    if (dial.tagName !== "Dial" || dial.namespaceURI || !cleanText(dial) || elements(dial).length !== 1 || Array.from(dial.attributes).some((attr) => attr.name !== "timeout" || !/^\d+$/.test(attr.value) || Number(attr.value) < 1 || Number(attr.value) > 60)) return false;
    const sip = elements(dial)[0];
    return sip.tagName === "Sip" && !sip.namespaceURI && sip.attributes.length === 0 && elements(sip).length === 0 && sip.textContent.trim() === expectedUri;
  } catch (_) { return false; }
}
function allowedUrl(draft, url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  if (parsed.hostname === "handler.twilio.com" && /^\/twiml\/EH[0-9a-fA-F]{32}$/.test(parsed.pathname)) return true;
  return draft?.fallbackFunction?.operation === "completed" && draft.fallbackFunction.url === parsed.href && draft.fallbackFunction.sipUri === sipUri(draft) && /^[a-z0-9-]+\.twil\.io$/i.test(parsed.hostname) && parsed.pathname === "/callsense-fallback";
}
function postToTwilio(url, { authToken } = {}) {
  return new Promise((resolve, reject) => {
    const params = { CallSid: "CA00000000000000000000000000000000", From: "+33100000000", To: "+33100000001" };
    const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/xml, text/xml" };
    if (authToken) headers["X-Twilio-Signature"] = twilio.getExpectedTwilioSignature(authToken, url, params);
    const request = https.request(url, { method: "POST", timeout: 5000, signal: AbortSignal.timeout(5000), headers }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(fail("Le TwiML Bin ne répond pas avec HTTP 200")); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > 65536) response.destroy(new Error("response too large")); else chunks.push(chunk); });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end(new URLSearchParams(params).toString());
  });
}
async function probe(draft, url, { post = postToTwilio, authToken } = {}) {
  // Fixed host and no redirects: the URL cannot target local or private services.
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw fail("URL TwiML Bin invalide"); }
  if (!allowedUrl(draft, parsed.href)) throw fail("URL de secours Twilio invalide");
  const expected = template(draft);
  let xml;
  try { xml = await post(parsed.href, { authToken }); } catch (_) { throw fail("Impossible de joindre le secours Twilio"); }
  if (!validateResponse(xml, expected.uri)) throw fail("Le TwiML ne correspond pas au secours SIP de ce restaurant");
  return { url: parsed.href, sipUri: expected.uri };
}
module.exports = { sipUri, template, functionSource, validateResponse, allowedUrl, postToTwilio, probe };
