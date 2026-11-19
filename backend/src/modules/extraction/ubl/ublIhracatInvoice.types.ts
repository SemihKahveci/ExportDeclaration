export interface UblParsedParty {
  name?: string;
  taxNo?: string;
  countryCode?: string;
  address?: string;
}

export interface UblParsedGoodsLine {
  lineNo: number;
  hsCode?: string;
  productCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
  origin?: string;
  deliveryTerm?: string;
  packageType?: string;
  lineNote?: string;
  netKg?: number;
}

export interface UblParsedInvoice {
  profileId?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  currency?: string;
  totalAmount?: number;
  seller?: UblParsedParty;
  /** BuyerCustomerParty — gerçek yurt dışı alıcı */
  buyer?: UblParsedParty;
  /** AccountingCustomerParty — genelde Ticaret Bakanlığı */
  accountingCustomer?: UblParsedParty;
  deliveryTerm?: string;
  invoiceNotes: string[];
  packageType?: string;
  /** Not / yapısal alandan gelen sevkiyat özeti */
  totalPackage?: number;
  grossKg?: number;
  netKg?: number;
  paymentType?: string;
  transportMode?: string;
  bankInfo?: string;
  goodsLines: UblParsedGoodsLine[];
}
