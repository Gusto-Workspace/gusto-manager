const { verifyServiceSignature } = require("./service-signature");

// Compatibilité avec les imports historiques. Les cartes cadeaux et le
// take-away utilisent désormais exactement le même protocole inter-service.
module.exports = {
  verifyGiftCardServiceSignature: verifyServiceSignature,
  verifyServiceSignature,
};
