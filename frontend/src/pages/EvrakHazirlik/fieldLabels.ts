const FIELD_LABELS: Record<string, string> = {
  invoiceNo: 'Fatura No',
  invoiceDate: 'Fatura Tarihi',
  currency: 'Döviz Cinsi',
  totalAmount: 'Toplam Fatura Bedeli',
  packageType: 'Kap Cinsi',
  totalPackage: 'Kap Adedi',
  grossKg: 'Brüt Kilo',
  netKg: 'Net Kilo',
  deliveryTerm: 'Teslim Şekli',
  paymentType: 'Ödeme Şekli',
  origin: 'Menşe Ülke',
  productCode: 'Malzeme No',
  description: 'Mal Tanımı',
  quantity: 'Miktar',
  unit: 'Birim',
  unitPrice: 'Birim Fiyat',
  lineTotal: 'Satır Tutarı',
  hsCode: 'GTİP',
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
};

export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const goods = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/.exec(field);
  if (goods) {
    const leaf = FIELD_LABELS[goods[2]!] ?? goods[2]!;
    return `${Number(goods[1]) + 1}. kalem · ${leaf}`;
  }
  const dotted = field.split('.');
  const leaf = dotted[dotted.length - 1] ?? field;
  if (FIELD_LABELS[leaf]) {
    if (field.includes('buyer')) return `Alıcı · ${FIELD_LABELS[leaf]}`;
    if (field.includes('seller')) return `Satıcı · ${FIELD_LABELS[leaf]}`;
    if (field.includes('notify')) return `Notify · ${FIELD_LABELS[leaf]}`;
    return FIELD_LABELS[leaf];
  }
  return field;
}
