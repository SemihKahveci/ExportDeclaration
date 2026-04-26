export const DeclarationStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  XML_GENERATED: "XML_GENERATED",
  ERROR: "ERROR"
} as const;

export type DeclarationStatusValue =
  (typeof DeclarationStatus)[keyof typeof DeclarationStatus];
