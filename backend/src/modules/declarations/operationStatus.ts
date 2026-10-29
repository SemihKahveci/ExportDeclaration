export function actionableFileStatus(fileStatus?: string, holdPreviousStatus?: string): string {
  if (fileStatus === "beklemede" && holdPreviousStatus) return holdPreviousStatus;
  return fileStatus ?? "";
}

export function releaseHold(operation: { holdPreviousStatus?: string; holdNote?: string }): void {
  operation.holdPreviousStatus = "";
  operation.holdNote = "";
}
