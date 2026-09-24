$ErrorActionPreference = "Stop"

$targets = @(
  "frontend/src/components/pipeline/DeclarationPipelinePanel.tsx",
  "frontend/src/components/pipeline/DocumentUploadCard.tsx",
  "frontend/src/pages/BeyannameYazim/DocChecklist.tsx",
  "frontend/src/pages/GtipHazirlik/QueryTab.tsx",
  "frontend/src/services/documentProcesses.ts"
)

foreach ($target in $targets) {
  if (Test-Path $target) {
    Remove-Item -Force $target
    Write-Host "Removed: $target"
  } else {
    Write-Host "Already absent: $target"
  }
}

Write-Host "Cleanup 0.3 safe-delete slice applied."
