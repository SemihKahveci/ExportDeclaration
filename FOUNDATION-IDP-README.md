# PATCH NOTE — 1.6.8.25 real scalar-recovery diagnostic

Add `backend/scripts/idp/verifyProductE2E16825RealQwenScalarRecoveryDiagnostic.ts`.

This verifier uses the real production queue/Qwen path and reports persisted `visionCandidateCheckpoint` recovery telemetry for every page. It is diagnostic-only: it does not alter production extraction, candidate projection, Foundation 6 resolution, promotion, or normalized writes.
