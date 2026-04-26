export interface ValidationRule {
  path: string;
  required?: boolean;
  minItems?: number;
  message: string;
}

export const mvpValidationRules: ValidationRule[] = [
  {
    path: "header.invoiceNo",
    required: true,
    message: "Fatura numarası zorunludur."
  },
  {
    path: "header.invoiceDate",
    required: true,
    message: "Fatura tarihi zorunludur."
  },
  {
    path: "parties.seller.name",
    required: true,
    message: "İhracatçı firma zorunludur."
  },
  {
    path: "parties.buyer.name",
    required: true,
    message: "Alıcı firma zorunludur."
  },
  {
    path: "goodsLines",
    required: true,
    minItems: 1,
    message: "En az bir ürün kalemi olmalıdır."
  }
];
