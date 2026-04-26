/**
 * Evrim şeması netleşince güncellenecek taslak eşleme (teknik doküman §9).
 */
export const evrimXmlMapping: Record<string, string> = {
  "Beyanname.InvoiceNo": "header.invoiceNo",
  "Beyanname.InvoiceDate": "header.invoiceDate",
  "Beyanname.Currency": "header.currency",
  "Beyanname.Buyer": "parties.buyer.name",
  "Beyanname.Seller": "parties.seller.name",
  "Beyanname.DeliveryTerm": "trade.deliveryTerm",
  "Beyanname.TransportMode": "transport.mode",
  "Beyanname.PaymentType": "trade.paymentType",
  "Beyanname.Origin": "trade.origin",
  "Package.TotalPackage": "packageInfo.totalPackage",
  "Weight.GrossKg": "packageInfo.grossKg",
  "Weight.NetKg": "packageInfo.netKg"
};
