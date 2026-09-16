function buildStripeMeterEventParams(job, billingContext) {
  const identifier = job.stripeUsageIdentifier || `gusto_sms_${job._id}`;
  return {
    event_name:
      process.env.STRIPE_SMS_METER_EVENT_NAME || "gusto_sms_credits",
    identifier,
    payload: {
      stripe_customer_id: billingContext.stripeCustomerId,
      value: String(job.billingCredits),
    },
    timestamp: Math.floor((job.acceptedAt || new Date()).getTime() / 1000),
  };
}

module.exports = { buildStripeMeterEventParams };
