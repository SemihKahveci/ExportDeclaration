/**
 * Teknik doküman §9 — İlk mapping taslağı (Evrim şeması netleşince tag isimleri güncellenebilir).
 * `xmlTag`: kök `<Beyanname>` altındaki çocuk etiket adı.
 * `path`: normalize model içi yol.
 */
export const beyannameXmlFields: { xmlTag: string; path: string }[] = [
  { xmlTag: "InvoiceNo", path: "header.invoiceNo" },
  { xmlTag: "InvoiceDate", path: "header.invoiceDate" },
  { xmlTag: "Currency", path: "header.currency" },
  { xmlTag: "Buyer", path: "parties.buyer.name" },
  { xmlTag: "Seller", path: "parties.seller.name" },
  { xmlTag: "DeliveryTerm", path: "trade.deliveryTerm" },
  { xmlTag: "TransportMode", path: "transport.mode" },
  { xmlTag: "PaymentType", path: "trade.paymentType" },
  { xmlTag: "Origin", path: "trade.origin" }
];

export const packageXmlFields: { xmlTag: string; path: string }[] = [
  { xmlTag: "TotalPackage", path: "packageInfo.totalPackage" }
];

export const weightXmlFields: { xmlTag: string; path: string }[] = [
  { xmlTag: "GrossKg", path: "packageInfo.grossKg" },
  { xmlTag: "NetKg", path: "packageInfo.netKg" }
];

/** Geriye dönük: düz anahtar eşlemesi (test / dışa aktarım). */
export const evrimXmlMappingFlat: Record<string, string> = Object.fromEntries([
  ...beyannameXmlFields.map((f) => [`Beyanname.${f.xmlTag}`, f.path]),
  ...packageXmlFields.map((f) => [`Package.${f.xmlTag}`, f.path]),
  ...weightXmlFields.map((f) => [`Weight.${f.xmlTag}`, f.path])
]);
