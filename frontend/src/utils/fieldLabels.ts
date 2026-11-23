const FIELD_LABELS: Record<string, string> = {
  invoiceNo: 'Fatura No',
  invoiceDate: 'Fatura Tarihi',
  currency: 'Döviz Cinsi',
  totalAmount: 'Toplam Fatura Bedeli',
  package: 'Kap',
  packageInfo: 'Kap Bilgisi',
  packageType: 'Kap Cinsi',
  totalPackage: 'Kap Adedi',
  grossKg: 'Brüt Kilo',
  netKg: 'Net Kilo',
  deliveryTerm: 'Teslim Şekli',
  paymentType: 'Ödeme Şekli',
  bankInfo: 'Banka Bilgisi',
  origin: 'Menşe Ülke',
  originCountry: 'Menşe Ülke',
  productCode: 'Malzeme No',
  description: 'Mal Tanımı',
  quantity: 'Miktar',
  unit: 'Birim',
  unitPrice: 'Birim Fiyat',
  lineTotal: 'Satır Tutarı',
  hsCode: 'GTİP',
  manufacturerNo: 'İmalatçı No',
  manufacturerType: 'İmalatçı Tipi',
  brand: 'Marka',
  exemptionCode: 'Muafiyet Kodu',
  permitCode: 'İzin Kodu',
  utsNo: 'UTS No',
  usedFlag: 'Kullanılmış',
  name: 'Unvan',
  address: 'Adres',
  taxNo: 'Vergi No',
  country: 'Ülke',
  mode: 'Taşıma Şekli',
  carrier: 'Taşıyıcı / Nakliyeci',
  vehiclePlate: 'Plaka',
  containerNo: 'Konteyner No',
  billOfLadingNo: 'Konşimento No',
  cmrNo: 'CMR No',
  awbNo: 'AWB No',
  declarationType: 'Beyanname Türü',
  exportType: 'İhracat Türü',
  customsOffice: 'Gümrük İdaresi',
  regimeCode: 'Rejim Kodu',
  fileReference: 'Dosya Referansı',
  declarationDate: 'Beyanname Tarihi',
};

export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const goods = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/.exec(field);
  if (goods) {
    const leaf = FIELD_LABELS[goods[2]!] ?? goods[2]!;
    return `${Number(goods[1]) + 1}. kalem · ${leaf}`;
  }
  const lines = /^lines\.(\d+)\.([A-Za-z0-9_]+)$/.exec(field);
  if (lines) {
    const leaf = FIELD_LABELS[lines[2]!] ?? lines[2]!;
    return `Kalem ${lines[1]} · ${leaf}`;
  }
  const dotted = field.split('.');
  const leaf = dotted[dotted.length - 1] ?? field;
  if (FIELD_LABELS[leaf]) {
    if (field.includes('buyer')) return `Alıcı · ${FIELD_LABELS[leaf]}`;
    if (field.includes('seller')) return `Satıcı · ${FIELD_LABELS[leaf]}`;
    if (field.includes('notify')) return `Notify · ${FIELD_LABELS[leaf]}`;
    if (field.startsWith('package.') || field.startsWith('packageInfo.')) {
      return FIELD_LABELS[leaf]!;
    }
    if (field.startsWith('invoice.') || field.startsWith('header.')) {
      return FIELD_LABELS[leaf]!;
    }
    return FIELD_LABELS[leaf];
  }
  return field;
}
