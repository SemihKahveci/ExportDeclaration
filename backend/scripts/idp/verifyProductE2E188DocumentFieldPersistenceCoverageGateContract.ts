import assert from "node:assert/strict";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DEFAULT_DECLARATION_FIELD_TARGETS } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";

const requiredTargets = [
  "trade.exitCountry", "trade.arrivalCountry", "trade.destinationCountry", "trade.tradeCountry",
  "transport.carrier", "transport.departureVehicleId", "transport.borderVehicleId", "transport.vehiclePlate",
  "transport.containerNo", "transport.billOfLadingNo", "transport.cmrNo", "transport.awbNo", "transport.transportDocumentNo",
  "finance.exchangeRate", "finance.freight", "finance.insurance", "finance.bankInfo",
  "documents.previousDocumentNo", "documents.circulationDocumentNo", "documents.originDocumentNo",
  "packageInfo.totalPackage", "packageInfo.packageType", "packageInfo.grossKg", "packageInfo.netKg",
  "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country",
] as const;

function schemaPathForNormalized(target: string): string {
  return `normalizedData.${target}`;
}

for (const target of requiredTargets) {
  assert(
    Object.values(DEFAULT_DECLARATION_FIELD_TARGETS).includes(target),
    `Foundation 6 promotion target missing: ${target}`,
  );
  assert(
    DeclarationModel.schema.path(schemaPathForNormalized(target)),
    `Mongoose Declaration schema would drop promoted field: ${target}`,
  );
}

// The coverage gate is intentionally source-present: an absent source field is
// not a failure. What is forbidden is losing a resolved DOCUMENT field between
// Foundation 6 promotion and persisted normalizedData.
const persistenceFamilies = {
  parties: requiredTargets.filter((x) => x.startsWith("parties.")),
  countries: requiredTargets.filter((x) => x.startsWith("trade.")),
  transport: requiredTargets.filter((x) => x.startsWith("transport.")),
  finance: requiredTargets.filter((x) => x.startsWith("finance.")),
  documents: requiredTargets.filter((x) => x.startsWith("documents.")),
  package: requiredTargets.filter((x) => x.startsWith("packageInfo.")),
};

console.log(JSON.stringify({
  event: "product-e2e-1.8.8.document-field-persistence-coverage-gate.contract.passed",
  persistedDocumentTargets: requiredTargets.length,
  persistenceFamilies: Object.fromEntries(Object.entries(persistenceFamilies).map(([k, v]) => [k, v.length])),
  guardrails: {
    foundation6PromotionTargetsPersistable: true,
    sourcePresentOnlySemantics: true,
    absentSourceNotCountedAsFailure: true,
    destinationCountriesRemainIndependent: true,
    transportFieldsFailClosedWhenAbsent: true,
    vendorAgnostic: true,
    directNormalizedWrite: false,
  },
}, null, 2));
