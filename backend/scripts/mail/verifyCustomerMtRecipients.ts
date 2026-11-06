import assert from "node:assert/strict";
import { mergeCustomerAndMtRecipients } from "../../src/modules/mail/customerMtRecipients.js";

assert.deepEqual(
  mergeCustomerAndMtRecipients(["musteri@ornek.com"], ["mt@firma.com", "yonetici@firma.com"]),
  { to: ["musteri@ornek.com"], cc: ["mt@firma.com", "yonetici@firma.com"] }
);

assert.deepEqual(
  mergeCustomerAndMtRecipients([], ["mt@firma.com", "yonetici@firma.com"]),
  { to: ["mt@firma.com", "yonetici@firma.com"], cc: [] }
);

assert.deepEqual(
  mergeCustomerAndMtRecipients(["mt@firma.com", "musteri@ornek.com"], ["mt@firma.com", "yonetici@firma.com"]),
  { to: ["mt@firma.com", "musteri@ornek.com"], cc: ["yonetici@firma.com"] }
);

assert.deepEqual(
  mergeCustomerAndMtRecipients(["  MUSTERI@ornek.com "], [" MT@firma.com ", "mt@firma.com"]),
  { to: ["musteri@ornek.com"], cc: ["mt@firma.com"] }
);

assert.deepEqual(mergeCustomerAndMtRecipients([], []), { to: [], cc: [] });

console.log("verifyCustomerMtRecipients: ok");
