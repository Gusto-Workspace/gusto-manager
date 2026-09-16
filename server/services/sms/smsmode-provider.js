const axios = require("axios");
const SmsProvider = require("./sms-provider");

class SmsModeProvider extends SmsProvider {
  constructor({ apiKey = process.env.SMSMODE_API_KEY, baseUrl = process.env.SMSMODE_API_BASE_URL || "https://rest.smsmode.com" } = {}) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async send({ to, sender, message, reference, callbackUrl }) {
    if (!this.apiKey) throw new Error("SMSMODE_API_KEY manquante");
    const payload = {
      recipient: { to: String(to).replace(/^\+/, "") },
      body: { text: message },
      refClient: reference,
      ...(sender ? { from: sender } : {}),
      ...(callbackUrl ? { callbackUrlStatus: callbackUrl } : {}),
    };
    const response = await axios.post(`${this.baseUrl}/sms/v1/messages`, payload, {
      timeout: Number(process.env.SMSMODE_TIMEOUT_MS || 10000),
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json", "Content-Type": "application/json" },
    });
    return { providerMessageId: response?.data?.messageId || "", rawStatus: response?.data?.status || null };
  }

  async reconcile({ providerMessageId, reference }) {
    if (!this.apiKey || (!providerMessageId && !reference)) return null;
    const path = providerMessageId
      ? `/sms/v1/messages/${encodeURIComponent(providerMessageId)}`
      : "/sms/v1/messages";
    const response = await axios.get(`${this.baseUrl}${path}`, {
      timeout: Number(process.env.SMSMODE_TIMEOUT_MS || 10000),
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      ...(providerMessageId ? {} : { params: { "searchBy[refClient]": reference, pageSize: 10 } }),
    });
    if (providerMessageId) return response?.data || null;
    return response?.data?.items?.find((item) => item?.refClient === reference) || null;
  }
}

module.exports = SmsModeProvider;
