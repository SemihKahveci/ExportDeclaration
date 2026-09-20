import type { ExportDeclarationContract } from "../export-contract/exportDeclarationContract.types.js";
import type { UblIhracatAdapterOptions, UblIhracatIssue, UblIhracatResult } from "./ublIhracatAdapter.types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function money(value: number): string {
  return Number(value).toFixed(2);
}

function issue(path: string, message: string, source: "NORMALIZED_DECLARATION" | "HUMAN_INPUT" = "NORMALIZED_DECLARATION"): UblIhracatIssue {
  return { code: "UBL_MISSING_REQUIRED_FIELD", path, message, source };
}

function transportCode(raw: string | undefined, explicit: string | undefined): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  const v = raw?.trim().toLocaleLowerCase("tr-TR");
  if (!v) return undefined;
  if (v === "3" || v === "karayolu" || v === "kara yolu" || v === "road") return "3";
  return undefined;
}

function unitCode(raw: string): string | undefined {
  const v = raw.trim().toLocaleLowerCase("tr-TR");
  if (v === "adet" || v === "pcs" || v === "piece" || v === "c62") return "C62";
  return undefined;
}

function partyXml(tag: "AccountingSupplierParty" | "AccountingCustomerParty", party: ExportDeclarationContract["parties"]["seller"]): string[] {
  if (!party) return [];
  const out = [`  <cac:${tag}>`, "    <cac:Party>"];
  if (party.taxNo) {
    out.push("      <cac:PartyIdentification>", `        <cbc:ID>${esc(party.taxNo)}</cbc:ID>`, "      </cac:PartyIdentification>");
  }
  out.push("      <cac:PartyName>", `        <cbc:Name>${esc(party.name)}</cbc:Name>`, "      </cac:PartyName>");
  if (party.address || party.country) {
    out.push("      <cac:PostalAddress>");
    if (party.address) out.push(`        <cbc:StreetName>${esc(party.address)}</cbc:StreetName>`);
    if (party.country) out.push("        <cac:Country>", `          <cbc:Name>${esc(party.country)}</cbc:Name>`, "        </cac:Country>");
    out.push("      </cac:PostalAddress>");
  }
  out.push("    </cac:Party>", `  </cac:${tag}>`);
  return out;
}

/**
 * Foundation 5.5E.1 — unsigned UBL-TR IHRACAT commercial adapter.
 *
 * Scope is intentionally limited to commercial data proven by supplied UBL-TR
 * IHRACAT examples. It NEVER emits XMLDSig/XAdES, certificate material,
 * digest/signature values or an embedded XSLT. Signing is a separate boundary.
 */
export function buildUnsignedUblIhracat(
  contract: ExportDeclarationContract,
  options: UblIhracatAdapterOptions,
): UblIhracatResult {
  const issues: UblIhracatIssue[] = [...contract.readiness.issues];

  if (!contract.invoice.invoiceNo) issues.push(issue("invoice.invoiceNo", "UBL IHRACAT için fatura numarası zorunlu."));
  if (!contract.invoice.invoiceDate) issues.push(issue("invoice.invoiceDate", "UBL IHRACAT için fatura tarihi zorunlu."));
  if (!contract.invoice.currency) issues.push(issue("invoice.currency", "UBL IHRACAT için para birimi zorunlu."));
  if (!contract.parties.seller?.name) issues.push(issue("parties.seller.name", "UBL IHRACAT için satıcı adı zorunlu."));
  if (!contract.parties.buyer?.name) issues.push(issue("parties.buyer.name", "UBL IHRACAT için alıcı adı zorunlu."));
  if (!contract.trade.deliveryTerm) issues.push(issue("trade.deliveryTerm", "UBL IHRACAT için teslim şekli zorunlu."));
  if (!options.uuid || !UUID_RE.test(options.uuid)) issues.push(issue("options.uuid", "Geçerli bir fatura UUID değeri zorunlu.", "HUMAN_INPUT"));

  const modeCode = transportCode(contract.transport.mode, options.transportModeCode);
  if (!modeCode) {
    issues.push({
      code: "UBL_UNSUPPORTED_CODE",
      path: "transport.mode",
      message: `UBL TransportModeCode doğrulanamadı: ${contract.transport.mode ?? "<boş>"}`,
      source: "NORMALIZED_DECLARATION"
    });
  }

  for (const [index, line] of contract.lines.entries()) {
    if (!unitCode(line.unit)) {
      issues.push({
        code: "UBL_UNSUPPORTED_CODE",
        path: `lines.${index}.unit`,
        message: `UBL birim kodu doğrulanamadı: ${line.unit}`,
        source: "NORMALIZED_DECLARATION"
      });
    }
  }

  if (issues.length) return { ready: false, issues };

  const currency = contract.invoice.currency!;
  const total = contract.invoice.totalAmount ?? contract.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const invoiceTypeCode = options.invoiceTypeCode?.trim() || "ISTISNA";
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    "  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>",
    "  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>",
    "  <cbc:ProfileID>IHRACAT</cbc:ProfileID>",
    `  <cbc:ID>${esc(contract.invoice.invoiceNo)}</cbc:ID>`,
    "  <cbc:CopyIndicator>false</cbc:CopyIndicator>",
    `  <cbc:UUID>${esc(options.uuid)}</cbc:UUID>`,
    `  <cbc:IssueDate>${esc(contract.invoice.invoiceDate)}</cbc:IssueDate>`
  ];
  if (options.issueTime) lines.push(`  <cbc:IssueTime>${esc(options.issueTime)}</cbc:IssueTime>`);
  lines.push(
    `  <cbc:InvoiceTypeCode>${esc(invoiceTypeCode)}</cbc:InvoiceTypeCode>`,
    `  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>`,
    `  <cbc:LineCountNumeric>${contract.lines.length}</cbc:LineCountNumeric>`,
    ...partyXml("AccountingSupplierParty", contract.parties.seller),
    ...partyXml("AccountingCustomerParty", contract.parties.buyer),
    "  <cac:LegalMonetaryTotal>",
    `    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(total)}</cbc:LineExtensionAmount>`,
    `    <cbc:PayableAmount currencyID="${esc(currency)}">${money(total)}</cbc:PayableAmount>`,
    "  </cac:LegalMonetaryTotal>"
  );

  for (const line of contract.lines) {
    const uom = unitCode(line.unit)!;
    lines.push(
      "  <cac:InvoiceLine>",
      `    <cbc:ID>${line.lineNo}</cbc:ID>`,
      `    <cbc:InvoicedQuantity unitCode="${uom}">${esc(line.quantity)}</cbc:InvoicedQuantity>`,
      `    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(line.lineTotal)}</cbc:LineExtensionAmount>`,
      "    <cac:Delivery>",
      "      <cac:DeliveryTerms>",
      `        <cbc:ID schemeID="INCOTERMS">${esc(contract.trade.deliveryTerm)}</cbc:ID>`,
      "      </cac:DeliveryTerms>",
      "      <cac:Shipment>",
      "        <cbc:ID/>",
      "        <cac:GoodsItem>",
      `          <cbc:RequiredCustomsID>${esc(line.hsCode)}</cbc:RequiredCustomsID>`,
      "        </cac:GoodsItem>",
      "        <cac:ShipmentStage>",
      `          <cbc:TransportModeCode>${esc(modeCode)}</cbc:TransportModeCode>`,
      "        </cac:ShipmentStage>",
      "      </cac:Shipment>",
      "    </cac:Delivery>",
      "    <cac:Item>",
      `      <cbc:Name>${esc(line.description)}</cbc:Name>`,
      "      <cac:SellersItemIdentification>",
      `        <cbc:ID>${esc(line.productCode)}</cbc:ID>`,
      "      </cac:SellersItemIdentification>",
      "    </cac:Item>",
      "    <cac:Price>",
      `      <cbc:PriceAmount currencyID="${esc(currency)}">${money(line.unitPrice)}</cbc:PriceAmount>`,
      "    </cac:Price>",
      "  </cac:InvoiceLine>"
    );
  }

  lines.push("</Invoice>");
  return { ready: true, xml: lines.join("\n"), lineCount: contract.lines.length, profileId: "IHRACAT", signed: false };
}
