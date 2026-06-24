/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_COMPANY_ID: string;
  readonly VITE_USER_ID?: string;
  readonly VITE_USE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
