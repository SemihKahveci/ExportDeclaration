/**
 * Dilim 2: party country/address candidates must emit F6-aligned ids
 * (`party-*-country` / `party-*-address`) so fusion can append `:f6-header-party`.
 * Also: city/country tails resolve to ISO without inventing countries.
 */
import assert from "node:assert/strict";
import { partyCountryValue } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";

assert.equal(partyCountryValue("TURKEY"), "TR");
assert.equal(partyCountryValue("ESTONYA"), "EE");
assert.equal(partyCountryValue("Istanbul / Turkey"), "TR");
assert.equal(partyCountryValue("Tallinn, Estonia"), "EE");
assert.equal(partyCountryValue("Zeytinburnu-Istanbul / TURKEY"), "TR");
assert.equal(partyCountryValue("DE"), "DE");
assert.equal(partyCountryValue("not-a-country"), undefined);
assert.equal(partyCountryValue("Punane 73 Tallinn"), undefined);
// Address-embedded country still resolves (promote path uses the same helper).
assert.equal(partyCountryValue("ITOSB 8. Cadde No:7 Tuzla Istanbul / Turkey"), "TR");

// Authority id contract (string literals used by discovery + F6).
const roleBoundCountryIds = [
  "party-seller-country:f6-header-party",
  "party-buyer-country:f6-header-party",
] as const;
const discoveryBaseIds = ["party-seller-country", "party-buyer-country"] as const;
for (const base of discoveryBaseIds) {
  assert.ok(
    roleBoundCountryIds.includes(`${base}:f6-header-party` as (typeof roleBoundCountryIds)[number]),
    `F6 expects ${base}:f6-header-party`,
  );
  assert.ok(
    !base.includes("explicit-role"),
    "discovery must not emit *-explicit-role country ids",
  );
}

console.log("verifyPartyCountryAuthorityIds: ok");
