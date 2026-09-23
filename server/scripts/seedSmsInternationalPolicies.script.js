require("dotenv").config();
const mongoose = require("mongoose");
const SmsDestinationPolicyModel = require("../models/sms-destination-policy.model");

const INTERNATIONAL_SMS_POLICIES = Object.freeze([
  { country: "BE", providerRateHt: 0.0616, billingCredits: 2, senderMode: "shortcode", senderRegistrationRequired: false, supportsDlr: true },
  { country: "CH", providerRateHt: 0.0667, billingCredits: 2, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
  { country: "LU", providerRateHt: 0.0704, billingCredits: 2, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
  { country: "DE", providerRateHt: 0.0792, billingCredits: 2, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
  { country: "GB", providerRateHt: 0.0395, billingCredits: 1, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
  { country: "ES", providerRateHt: 0.0308, billingCredits: 1, senderMode: "registered_alpha", senderRegistrationRequired: true, supportsDlr: true },
  { country: "IT", providerRateHt: 0.0352, billingCredits: 1, senderMode: "registered_alpha", senderRegistrationRequired: true, supportsDlr: true },
  { country: "NL", providerRateHt: 0.0836, billingCredits: 2, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
  { country: "PT", providerRateHt: 0.0176, billingCredits: 1, senderMode: "alpha", senderRegistrationRequired: false, supportsDlr: true },
]);

function buildPolicyUpdate(policy, reviewedAt = new Date()) {
  return {
    country: policy.country,
    enabled: false,
    provider: "smsmode",
    senderMode: policy.senderMode || null,
    senderRegistrationRequired:
      typeof policy.senderRegistrationRequired === "boolean"
        ? policy.senderRegistrationRequired
        : null,
    supportsDlr:
      typeof policy.supportsDlr === "boolean" ? policy.supportsDlr : null,
    providerRateHt: policy.providerRateHt,
    billingCredits: policy.billingCredits,
    fallbackSender: "",
    lastReviewedAt: reviewedAt,
  };
}

async function main() {
  if (!process.env.CONNECTION_STRING_TEST) {
    throw new Error("CONNECTION_STRING_TEST manquante.");
  }
  await mongoose.connect(process.env.CONNECTION_STRING_TEST);
  const reviewedAt = new Date();
  await SmsDestinationPolicyModel.bulkWrite(
    INTERNATIONAL_SMS_POLICIES.map((policy) => ({
      updateOne: {
        filter: { country: policy.country },
        update: { $set: buildPolicyUpdate(policy, reviewedAt) },
        upsert: true,
      },
    })),
  );
  console.log(
    `${INTERNATIONAL_SMS_POLICIES.length} politiques internationales préparées et laissées désactivées.`,
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { INTERNATIONAL_SMS_POLICIES, buildPolicyUpdate, main };
