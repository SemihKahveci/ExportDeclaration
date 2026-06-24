# Customs Panel → ExportDeclaration Frontend Entegrasyon Planı

> **Tarih:** 7 Haziran 2026  
> **Kaynak UI:** `C:\Users\Semih\Desktop\ExportDeclaration\Customs_Panel-main`  
> **Hedef repo:** `C:\Users\Semih\Desktop\ExportDeclaration\ExportDeclaration`  
> **Durum:** Faz 1 uygulandı — Customs Panel UI + backend API birleştirmesi

---

## 0. Mevcut Durum Özeti (Son Güncelleme)

### Customs Panel'den gelen (aynı / uygulandı)
- Tüm operasyon ekranları: Dosya Takip, GTİP, Evrak, Beyanname, Tescil, Kapanış, Müşteriler, Ayarlar
- Tailwind UI, AppShell, Sidebar, permission sistemi, mock servis katmanı (kısmen API'ye bağlandı)
- `BrowserRouter`, route yapısı, DevSwitcher

### Eski minimal frontend'den korunan (API katmanı)
- `src/api/apiClient.ts`, `declarationApi.ts`, `documentApi.ts`
- `src/config/appEnv.ts` (`VITE_COMPANY_ID`, proxy)
- `src/api/types/` — backend veri modelleri
- `src/api/adapters/` — backend → UI dönüşümü

### Yeni birleştirilen parçalar
| Özellik | Konum |
|---------|--------|
| Pipeline (çıkarım, normalizasyon, doğrulama, XML) | `components/pipeline/DeclarationPipelinePanel.tsx` → Beyanname detay |
| Belge yükleme | `components/pipeline/DocumentUploadCard.tsx` → Beyanname + Evrak Hazırlık |
| Yeni beyanname oluşturma | Dosya Takip "Yeni Talep" + Beyanname "Yeni Beyanname" |
| API bağlı servisler | `declarationsService`, `beyannameService`, `evrakService`, `filesService` |

### Silinen eski kalıntılar
- `DashboardPage`, `DeclarationsPage`, `DeclarationDetailPage`, `NewDeclarationPage`
- Eski `AppLayout`, `Header`, `components/declarations/*`, `components/documents/*`

### Hâlâ mock / eksik
- Müşteriler, GTİP, Tescil, Kapanış, Evrak kuralları, Ayarlar (kullanıcılar)
- Gerçek auth (login/JWT)
- Dosya Takip: atama, hat rengi, eskalasyon alanları (backend yok)
- Evrak çakışma analizi, belge önizleme (backend yok)
- Beyanname form alanlarının `PATCH` ile kaydedilmesi

---

## 1. Genel Bakış

İki ayrı proje birleştiriliyor:

| Parça | Konum | Durum |
|--------|--------|--------|
| **ExportDeclaration (mevcut repo)** | `ExportDeclaration\ExportDeclaration` | Backend + minimal frontend, **gerçek API bağlantılı** |
| **Customs Panel (yeni UI)** | `ExportDeclaration\Customs_Panel-main` | Tam operasyon paneli, **tamamen mock veri** |

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  Mevcut ExportDeclaration   │     │     Customs_Panel-main      │
│  frontend/ — 4 sayfa        │     │  10+ modül, Tailwind UI     │
│  fetch + x-company-id  ─────┼────►│  mock services (HTTP yok)   │
└──────────────┬──────────────┘     └─────────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│  backend/ — Express + MongoDB │
│  11 endpoint                │
└─────────────────────────────┘
```

**Amaç:** Customs Panel UI'ını `frontend/` olarak kullanmak; mevcut backend API altyapısını korumak; mock servisleri kademeli olarak gerçek API'ye bağlamak.

---

## 2. Mevcut ExportDeclaration Yapısı

### 2.1 Monorepo

- Kök `package.json` backend'i yönetir
- `frontend/` ayrı paket (`npm --prefix frontend`)
- npm workspaces **yok**

| Konum | Rol |
|--------|-----|
| `backend/src/` | Express + Mongoose API |
| `frontend/` | Vite + React SPA |
| `dist/` | Backend derleme çıktısı |
| `uploads/` | Yüklenen dosyalar |
| `env.example` | Backend + frontend env referansı |

### 2.2 Mevcut Frontend (değiştirilecek)

| Özellik | Değer |
|---------|-------|
| Stack | React 18 + TypeScript + Vite 5 |
| Styling | Düz CSS (UI kütüphanesi yok) |
| Router | `HashRouter` (statik hosting uyumu) |
| Sayfalar | 4 route: Dashboard, Declarations list, New, Detail |

**Route'lar (`frontend/src/App.tsx`):**

| Route | Sayfa |
|--------|--------|
| `/` | DashboardPage |
| `/declarations` | DeclarationsPage |
| `/declarations/new` | NewDeclarationPage |
| `/declarations/:id` | DeclarationDetailPage |

### 2.3 API Client (korunacak)

| Dosya | Görev |
|--------|--------|
| `frontend/src/config/appEnv.ts` | `VITE_*` okuma, `apiBaseUrl()` |
| `frontend/src/api/apiClient.ts` | fetch sarmalayıcıları, `ApiError`, auth header |
| `frontend/src/api/declarationApi.ts` | Beyanname endpoint'leri |
| `frontend/src/api/documentApi.ts` | Belge endpoint'leri |

**Auth (Sprint 1):**

- Zorunlu: `x-company-id` (`VITE_COMPANY_ID`)
- Opsiyonel: `x-user-id` (`VITE_USER_ID`)
- JWT / oturum **yok**

**Dev proxy (`vite.config.ts`):**

- Port: `5173`
- `/api` ve `/health` → `http://localhost:3000`

### 2.4 Backend API (11 endpoint)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/health` | Sağlık kontrolü (auth yok) |
| GET | `/api/declarations` | Beyanname listesi |
| POST | `/api/declarations` | Yeni beyanname |
| GET | `/api/declarations/:id` | Beyanname detay |
| PATCH | `/api/declarations/:id` | normalizedData / status güncelle |
| POST | `/api/declarations/:id/extract` | Belge çıkarımı |
| POST | `/api/declarations/:id/normalize` | Normalizasyon |
| POST | `/api/declarations/:id/validate` | Doğrulama |
| POST | `/api/declarations/:id/generate-xml` | XML üret |
| GET | `/api/declarations/:id/download-xml` | XML indir |
| GET | `/api/declarations/:id/documents` | Belge listesi |
| POST | `/api/declarations/:id/documents` | Belge yükle (multipart) |

**Belge tipleri (`DocumentType`):**

`INVOICE`, `E_INVOICE_XML`, `EXPORT_INVOICE`, `PACKING_LIST`, `PROFORMA`, `BILL_OF_LADING_INSTRUCTION`, `OTHER`

**Beyanname durumları (`DeclarationStatus`):**

`DRAFT`, `READY`, `XML_GENERATED`, `ERROR`

**Backend veri modeli (`declaration.model.ts`):**

- `companyId`, `status`, `normalizedData`, `sourceTrace`, `generatedXmlPath`, `createdBy`, timestamps
- `normalizedData`: header, parties, trade, transport, packageInfo, goodsLines

---

## 3. Customs Panel Yapısı

### 3.1 Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Build | Vite 5 |
| UI | React 18 + TypeScript |
| Routing | react-router-dom v6, `BrowserRouter` |
| Styling | Tailwind CSS 3 + CSS değişkenleri |
| İkonlar | lucide-react |
| (Kullanılmayan) | `@supabase/supabase-js` — bağımlılıkta var, kodda yok |

### 3.2 Sayfalar ve Route'lar

| Route | Bileşen | Açıklama |
|-------|---------|----------|
| `/` | Redirect → `/dosya-takip` | |
| `/dosya-takip` | DosyaTakipPage | Gümrük dosyaları listesi |
| `/gtip-hazirlik` | GtipHazirlikPage | GTİP kontrolü |
| `/evrak-hazirlik` | EvrakHazirlikPage | Evrak durumu, çakışma analizi |
| `/beyanname` | BeyannameYazimPage | Beyanname yazım & kontrol |
| `/tescil` | BeyannameTescilPage | Tescil süreci |
| `/kapanis` | KapanisMutabakatPage | Kapanış / mutabakat |
| `/gtip-malzeme` | GtipMalzemePage | Malzeme-GTİP kayıtları |
| `/musteriler` | MusterilerPage | Müşteri yönetimi |
| `/evraklar` | EvraklarPage | Evrak kuralları CRUD |
| `/ayarlar` | AyarlarPage | Kullanıcı & doküman süreçleri |
| `/admin/organizations/*` | PlaceholderPage | Stage 3 placeholder |
| `/__ui` | UIShowcasePage | Dev-only UI kataloğu |

### 3.3 Mock Servis Katmanı (12 dosya)

| Servis | Sayfa | HTTP |
|--------|-------|------|
| `filesService` | Dosya Takip | ❌ |
| `declarationsService` / `beyannameService` / `tescilService` / `kapanisService` | Beyanname, Tescil, Kapanış | ❌ |
| `documentsService` / `evrakService` | Evrak Hazırlık, Ayarlar | ❌ |
| `customersService` | Müşteriler | ❌ |
| `gtipService` | GTİP Hazırlık, GTİP/Malzeme | ❌ |
| `evraklarService` / `rulesService` | Evraklar | ❌ |
| `usersService` | Ayarlar | ❌ |
| `costsService`, `mailsService`, `organizationsService` | Kısmen / kullanılmıyor | ❌ |

**Kritik:** Kod tabanında **0 HTTP isteği** — tüm veri `delay()` + mock array.

### 3.4 Auth (Customs Panel)

- Login sayfası **yok**
- JWT / token **yok**
- Hardcoded mock kullanıcı (`AppContext`)
- Capability tabanlı route guard (`ProtectedRoute`, `useCan`)
- Dev-only kullanıcı değiştirici (`DevSwitcher`)

---

## 4. Frontend Değiştirme Planı

### 4.1 Taşınacak (Customs Panel → frontend/)

- Tüm `src/` (pages, components, context, permissions, routes, services, types)
- `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`
- `tsconfig.app.json`, `index.html`, `package.json`

### 4.2 Korunacak / Birleştirilecek (mevcut frontend'den)

| Dosya / özellik | Neden |
|-----------------|-------|
| `src/api/` | Gerçek HTTP client |
| `src/config/appEnv.ts` | VITE env yapılandırması |
| `vite.config.ts` proxy + `@` alias | Dev ortamı |
| `env.example` (kök) | Ortam değişkenleri referansı |
| Kök `package.json` script'leri | `dev:web`, `build:web` |

### 4.3 Yeni eklenecek

| Dosya | Görev |
|--------|--------|
| `src/api/types/declaration.types.ts` | Backend beyanname tipleri |
| `src/api/types/document.types.ts` | Backend belge tipleri |
| `src/api/adapters/declarationAdapter.ts` | Backend → UI model dönüşümü |
| `src/api/adapters/documentAdapter.ts` | Belge → UI model dönüşümü |

---

## 5. Bağlanabilecek Bağlantılar

### 5.1 Beyanname Yazım (`/beyanname`) — Yüksek öncelik ✅ Faz 1

| Customs Panel ihtiyacı | Backend API | Not |
|------------------------|-------------|-----|
| Beyanname listesi | `GET /api/declarations` | Adapter: `_id` → `id`, ref/customer türet |
| Beyanname detay | `GET /api/declarations/:id` | `normalizedData` → `formFields` |
| Belge checklist | `GET .../documents` | Tip etiketleri map |
| Kaynak kartları | `sourceTrace` | `ParsedSourceCard[]` formatına dönüşüm |
| Çıkarım | `POST .../extract` | Mevcut |
| Normalizasyon | `POST .../normalize` | Mevcut |
| Doğrulama | `POST .../validate` | Uyarı kutularına map |
| XML üret / indir | `generate-xml`, `download-xml` | Mevcut |
| Manuel düzenleme | `PATCH .../id` | `normalizedData` güncelle |
| Field boxes (overlay) | — | Statik UI verisi (mock'tan kalır) |

### 5.2 Evrak Hazırlık (`/evrak-hazirlik`) — Kısmi ⚠️ Faz 2

| İhtiyaç | Backend | Not |
|---------|---------|-----|
| Dosya listesi | `GET /api/declarations` | Declaration → EvrakFile adapter |
| Belge listesi | `GET .../documents` | UploadedDocument → EvrakDocRow |
| Belge yükleme | `POST .../documents` | Mevcut |
| Çakışma analizi | ❌ | sourceTrace'den türetilebilir (kısmi) |
| Önizleme | ❌ | Dosya serve endpoint yok |

### 5.3 Dosya Takip (`/dosya-takip`) — Çok kısmi ⚠️ Faz 3

Backend'de "dosya" entity'si yok. Geçici olarak beyanname listesi map edilebilir; `FileStatus`, `assignee`, `hatColor`, `escalation` alanları backend'de tanımlı değil.

---

## 6. Eksik Bağlantılar (Tam Liste)

### 6.A Backend'de hiç olmayan modüller

| Modül | Ekran | Gerekli API (örnek) |
|-------|-------|---------------------|
| **Dosya takip** | `/dosya-takip` | `GET/POST /api/files`, durum geçişleri, atama |
| **Müşteriler** | `/musteriler` | CRUD müşteri, adres, domain, bildirim kuralları |
| **GTİP hazırlık** | `/gtip-hazirlik` | GTİP uyumluluk, sorgu talepleri |
| **GTİP / Malzeme** | `/gtip-malzeme` | Malzeme-GTİP kayıtları, import |
| **Evrak kuralları** | `/evraklar` | Ülke/GTİP koşullu kural CRUD |
| **Tescil** | `/tescil` | Tescil süreci, timeline, bildirim |
| **Kapanış / Mutabakat** | `/kapanis` | Maliyet, kontrol listesi, mail, kapanış |
| **Kullanıcılar / yetkiler** | `/ayarlar` | Kullanıcı CRUD, capability yönetimi |
| **Organizasyonlar** | `/admin/organizations` | Multi-tenant org yönetimi |
| **Mail şablonları** | Ayarlar | Mail listesi, gönderim |
| **Maliyet** | Kapanış maliyet sekmesi | Maliyet kalemleri CRUD |
| **Belge önizleme** | Evrak/Beyanname | `GET /api/documents/:id/preview` |
| **Gerçek auth** | Tüm ekranlar | Login, JWT/session, refresh token |

### 6.B Veri modeli uyumsuzlukları

| Customs Panel | Backend | Çözüm |
|---------------|---------|-------|
| `Declaration.id`, `ref`, `customer` | `_id`, `companyId`, `status` | Adapter katmanı |
| Status: `taslak`, `tescilli`, `onaya-hazir`… | `DRAFT`, `READY`, `XML_GENERATED`, `ERROR` | Enum map |
| `BeyannameFormFields` (Türkçe) | `normalizedData.header/parties/...` | Dönüşüm fonksiyonu |
| `FieldBox[]`, `ParsedSourceCard[]` | `sourceTrace` + `normalizedData` | Map + statik overlay |
| `Document.type` (serbest string) | `INVOICE`, `PACKING_LIST`… | Enum → etiket |
| `CustomsFile` (yaşam döngüsü) | Sadece `Declaration` | Ayrı entity gerekir |

### 6.C Frontend altyapı eksikleri (Customs Panel'de yoktu)

| Özellik | Mevcut FE | Customs Panel |
|---------|-----------|---------------|
| HTTP client | ✅ | ❌ |
| `VITE_*` env | ✅ | ❌ |
| Vite dev proxy | ✅ | ❌ |
| `@` path alias | ✅ | ❌ |
| `ApiError` sınıfı | ✅ | ❌ |
| `.env.example` | ✅ (kök) | ❌ |

### 6.D Placeholder / kullanılmayan

- `/admin/organizations/*` — "Stage 3'te uygulanacak"
- `costsService`, `mailsService`, `organizationsService` — mock var, sayfa bağlantısı yok/kısmi
- `@supabase/supabase-js` — bağımlılıkta var, kodda kullanılmıyor

---

## 7. Entegrasyon Fazları

```
Faz 1 ─ Frontend swap + apiClient + Beyanname API bağlantısı
  │
Faz 2 ─ Evrak Hazırlık: belge listesi / yükleme
  │
Faz 3 ─ Dosya Takip: geçici declaration listesi adapter
  │
Faz 4+ ─ Backend genişletme: files, customers, gtip, tescil, kapanış, auth
```

### Faz 1 checklist

- [x] Bu doküman oluşturuldu
- [x] Customs_Panel → `frontend/` taşındı
- [x] `api/`, `config/`, vite proxy, `@` alias birleştirildi
- [x] `declarationAdapter.ts`, `documentAdapter.ts`, `fileAdapter.ts` yazıldı
- [x] `beyannameService` / `beyannameListeService` API'ye bağlandı
- [x] `evrakService`, `documentsService`, `filesService` kısmen API'ye bağlandı
- [ ] `npm install --prefix frontend && npm run typecheck --prefix frontend` (yerelde çalıştırın)

### Faz 2 checklist

- [x] `evrakService.getFiles()` → declaration listesi
- [x] `evrakService.getDocs()` → document listesi
- [ ] Belge yükleme UI → `uploadDocument()` (henüz UI bağlantısı yok)

---

## 8. Ortam Değişkenleri

### Backend (kök `.env`)

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/export_declaration
UPLOAD_DIR=uploads
JSON_BODY_LIMIT=2mb
# CORS_ORIGIN=http://localhost:5173
```

### Frontend (`frontend/.env`)

```env
# Dev'de boş bırakılabilir (Vite proxy kullanır)
# VITE_API_BASE=https://senin-api.onrender.com
VITE_COMPANY_ID=507f1f77bcf86cd799439011
# VITE_USER_ID=
```

---

## 9. Yerel Geliştirme

İki terminal:

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — UI
npm run dev:web
```

- API: `http://localhost:3000`
- UI: `http://localhost:5173`

---

## 10. Script Referansı

### Kök package.json

| Script | Komut |
|--------|--------|
| `dev` / `dev:api` | Backend hot reload |
| `dev:web` | Vite dev server |
| `build` | Backend → `dist/` |
| `build:web` | Frontend build |
| `build:frontend` | CI için tam frontend build |
| `start` | Prod API |

### Frontend package.json

| Script | Komut |
|--------|--------|
| `dev` | `vite` |
| `build` | `vite build` → `frontend/dist/` |
| `typecheck` | `tsc --noEmit` |

---

## 11. Sonuç

- **Customs Panel** görsel olarak kapsamlı operasyon paneli; **hiçbir gerçek API bağlantısı yok**.
- **Mevcut backend** yalnızca beyanname pipeline'ını (11 endpoint) destekliyor.
- **Doğrudan bağlanabilir:** Beyanname yazım/kontrol akışının ~%60'ı.
- **Eksik:** 10+ modül için backend API, auth, veri modeli adapter'ları.

Bu doküman entegrasyon sürecinde güncellenecektir.
