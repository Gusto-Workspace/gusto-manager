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

  async senderExists(sender) {
    if (!this.apiKey) throw new Error("SMSMODE_API_KEY manquante");
    const expected = String(sender || "").trim();
    if (!expected) return { exists: false };

    const pageSize = 100;
    for (let page = 1; page <= 100; page += 1) {
      const response = await axios.get(`${this.baseUrl}/commons/v1/channels`, {
        timeout: Number(process.env.SMSMODE_TIMEOUT_MS || 10000),
        headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
        params: { page, pageSize },
      });
      const data = response?.data;
      const channels = Array.isArray(data)
        ? data
        : data?.items || data?.channels || data?.content;
      if (!Array.isArray(channels)) {
        throw new Error("Réponse channels smsmode invalide");
      }

      const smsChannels = channels
        .filter((channel) => String(channel?.type || "").toUpperCase() === "SMS")
        .sort(
          (left, right) =>
            Number(
              String(right?.flow || "").toUpperCase() === "TRANSACTIONAL",
            ) -
            Number(
              String(left?.flow || "").toUpperCase() === "TRANSACTIONAL",
            ),
        );
      const channel = smsChannels.find((candidate) => {
        const senders = [
          candidate?.defaultFromField,
          ...(Array.isArray(candidate?.fromFieldList)
            ? candidate.fromFieldList
            : []),
        ].map((value) => String(value || "").trim());
        return senders.includes(expected);
      });
      if (channel) {
        return {
          exists: true,
          channelId: channel.channelId || "",
          channelName: channel.name || "",
        };
      }

      if (Array.isArray(data)) return { exists: false };
      const totalPages = Number(
        data?.totalPages || data?.pagination?.totalPages || 0,
      );
      const totalItems = Number(
        data?.totalItems || data?.total || data?.pagination?.totalItems || 0,
      );
      const nextPage = data?.nextPage || data?.pagination?.nextPage;
      const hasNext = data?.hasNext ?? data?.pagination?.hasNext;
      const morePages =
        Boolean(nextPage) ||
        hasNext === true ||
        (totalPages > 0 && page < totalPages) ||
        (totalItems > 0 && page * pageSize < totalItems) ||
        channels.length === pageSize;
      if (!morePages) return { exists: false };
    }
    throw new Error("Pagination channels smsmode excessive");
  }
}

module.exports = SmsModeProvider;
