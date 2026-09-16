class SmsProvider {
  async send() {
    throw new Error("SmsProvider.send doit être implémenté.");
  }

  async reconcile() {
    return null;
  }
}

module.exports = SmsProvider;
