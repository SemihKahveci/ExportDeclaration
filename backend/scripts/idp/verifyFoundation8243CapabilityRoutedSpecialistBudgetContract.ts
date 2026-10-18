import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const fusion = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");
  const execution = await readFile("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts", "utf8");
  const chunking = await readFile("backend/src/modules/idp/understanding/invoiceUnderstandingGoodsChunking.ts", "utf8");

  const checks = {
    capabilityDomainSetExists: fusion.includes('foundation8SpecialistDomains = new Set<"PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS">'),
    reconciliationDrivesRouting: fusion.includes("foundation8ShadowAudit.reconciliation.recoveryRequests.map(request => request.domain)"),
    corePartyGapCanRoute: fusion.includes('foundation8SpecialistDomains.add("PARTIES")'),
    coreCommercialGapCanRoute: fusion.includes('foundation8SpecialistDomains.add("COMMERCIAL")'),
    optionalLogisticsNotForced: !fusion.includes('foundation8SpecialistDomains.add("LOGISTICS")'),
    executionAcceptsDomainFilter: execution.includes("domains?: ReadonlySet<InvoiceSpecialistDomain>"),
    executionFiltersRequests: execution.includes("params.domains.has(request.domain)"),
    goodsPagesAreEvidenceRouted: fusion.includes("shadowUnderstanding.goodsTable.rows.flatMap(row => row.pageNumbers)"),
    goodsPageFilterExists: execution.includes("goodsTargetPageNumbers?: ReadonlySet<number>") && chunking.includes("targetPageNumbers?.size && !targetPageNumbers.has(target.pageNumber)"),
    adjacentContextPreserved: chunking.includes("const next = ordered[index + 1]"),
    noDirectNormalizedWrite: !fusion.includes("normalizedData =") && !execution.includes("normalizedData =")
  };
  for (const [name, ok] of Object.entries(checks)) assert.equal(ok, true, `8.24.3 contract failed: ${name}`);
  console.log({ event: "foundation-8.24.3.capability-routed-specialist-budget.passed", ...checks });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
