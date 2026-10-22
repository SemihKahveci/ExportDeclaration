export const RETURN_TO_WRITING_NOTICE =
  "Bu dosya iç kontrol veya onaydan beyanname yazımına geri gönderildi.";

export function actionableFileStatus(fileStatus?: string, holdPreviousStatus?: string): string {
  if (fileStatus === "beklemede" && holdPreviousStatus) return holdPreviousStatus;
  return fileStatus ?? "";
}

export function releaseHold(operation: { holdPreviousStatus?: string; holdNote?: string }): void {
  operation.holdPreviousStatus = "";
  operation.holdNote = "";
}
