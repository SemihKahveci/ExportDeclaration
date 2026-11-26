export function isExportRegime(rejim: string): boolean {
  const text = rejim.trim().toLocaleLowerCase('tr-TR');
  return text.startsWith('10') || text.includes('ihracat');
}
