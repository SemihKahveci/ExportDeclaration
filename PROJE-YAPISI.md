# Proje yapısı — dosya dosya rehber

İhracat beyanname operasyonu: belge yükleme, çıkarım (extraction), normalizasyon, doğrulama, Evrim XML üretimi. **Monorepo:** kökte Node/Express API (`tsc` → `dist/`), `frontend/` altında Vite + React arayüzü.

---

## Kök dizin (`/`)

| Dosya / klasör | Ne işe yarar? |
|----------------|----------------|
| `package.json` | Tek `npm` kökü: backend script’leri, `frontend/` için `--prefix` ile alt komutlar. `build` = API TypeScript derlemesi; `build:frontend` = ön yüz `npm ci` + `vite build`; `start` = `node dist/index.js`. |
| `package-lock.json` | Kök bağımlılık kilidi (Express, Mongoose, vb.). |
| `tsconfig.json` | Sadece **backend** derlemesi: `rootDir: backend/src`, `outDir: dist`. |
| `env.example` | Tüm ortam değişkenlerinin tek referans listesi (API + Vite `VITE_*`). Gerçek değerler için kök `.env` veya hosting panelleri. |
| `.env` | Yerel gizli ayarlar (repoya **commit edilmez**; `.gitignore`). |
| `.gitignore` | `node_modules/`, `dist/`, `.env`, `uploads/` vb. |
| `dist/` | `npm run build` çıktısı — çalışan API (`index.js`, modüller). |
| `uploads/` | Yüklenen PDF/XML dosyalarının disk yolu (`UPLOAD_DIR`); git’te yok. |

---

## Backend (`backend/src/`)

### Giriş ve uygulama iskeleti

| Dosya | Ne işe yarar? |
|--------|----------------|
| `index.ts` | Süreç girişi: `uploads` klasörünü oluşturur, Mongo’ya bağlanır, `app`’i `env.port` üzerinden dinletir; port çakışması mesajı. |
| `app.ts` | Express uygulaması: CORS (`buildCorsOptions`), JSON body limiti, `/health`, `/api/declarations` + `authContextMiddleware` + `declarationRouter`, global `errorHandler`. |

### `config/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `env.ts` | `dotenv` yükler; `PORT`, `MONGODB_URI`, `UPLOAD_DIR`, `JSON_BODY_LIMIT`, `NODE_ENV`, `CORS_ORIGIN` (virgüllü; boşsa CORS `origin: true`), eski `CORS_ORIGINS` geriye dönük okuma. |
| `db.ts` | Mongoose `connect` / `disconnect`. |
| `corsOptions.ts` | `cors` paketi için seçenekler: izinli origin listesi veya `true`, metodlar ve `x-company-id` / `x-user-id` başlıkları. |

### `common/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `middlewares/authContext.ts` | `x-company-id` (zorunlu ObjectId) ve isteğe bağlı `x-user-id`; `OPTIONS` için doğrudan `next()` (preflight). `req.auth` doldurur. |
| `middlewares/errorHandler.ts` | Hataları JSON `{ ok: false, error }` olarak döner; `HttpError` status kullanır. |
| `utils/asyncHandler.ts` | Async route handler’ları try/catch ile `next(err)` sarar. |
| `utils/getByPath.ts` | İç içe nesnede yol ile değer okuma yardımcısı. |
| `enums/declarationStatus.ts` | Beyanname durum enum’u. |
| `enums/documentType.ts` | Belge tipi enum’u. |

### `modules/declarations/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `declaration.model.ts` | Mongoose şema: beyanname, ham çıkarımlar, normalize edilmiş alanlar, XML yolu vb. |
| `declaration.service.ts` | İş kuralları: oluşturma, listeleme, güncelleme, çıkarım/normalizasyon/doğrulama/XML servislerini orkestre eder. |
| `declaration.controller.ts` | HTTP → service; `req.auth.companyId` ile firma kapsamı. |
| `declaration.routes.ts` | REST rotaları: CRUD, `extract`, `normalize`, `validate`, `generate-xml`, `download-xml`; alt rota `/:id/documents`. |

### `modules/documents/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `document.model.ts` | Yüklenen belge kaydı (tip, dosya yolu, meta). |
| `document.service.ts` | Multer ile dosya kaydı, listeleme, silme vb. |
| `document.controller.ts` | Multipart / JSON cevapları. |
| `document.routes.ts` | Beyanname altında belge endpoint’leri. |

### `modules/extraction/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `extraction.service.ts` | Belge tiplerine göre çıkarım zinciri; PDF/XML metin okuma. |
| `extractors/*.ts` | Fatura, konşimento, proforma, packing list, ihracat faturası, XML fatura, heuristik metin ayrıştırma vb. modüler çıkarıcılar. |

### `modules/normalization/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `normalizedDeclaration.types.ts` | Normalize edilmiş yapının TypeScript tipleri. |
| `sourcePriority.rules.ts` | Alan bazlı kaynak öncelik kuralları. |
| `fieldResolver.service.ts` | Kurallara göre alan çözümleme / birleştirme. |

### `modules/validation/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `validation.rules.ts` | Beyanname doğrulama kuralları tanımları. |
| `declarationValidator.service.ts` | Kuralları çalıştırıp sonuç üretir. |

### `modules/xml/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `evrimXml.mapping.ts` | Dahili alan → Evrim XML alan eşlemesi. |
| `evrimXml.generator.ts` | XML dosya üretimi. |

---

## Frontend (`frontend/`)

### Yapılandırma ve giriş

| Dosya | Ne işe yarar? |
|--------|----------------|
| `package.json` | React, Vite, react-router-dom; `dev` / `build` / `preview` / `typecheck`. |
| `package-lock.json` | Ön yüz bağımlılık kilidi. |
| `vite.config.ts` | React plugin, `@/` → `src/` alias; dev’de `/api` ve `/health` → `localhost:3000` proxy. |
| `tsconfig.json` / `tsconfig.node.json` | TS + Vite Node ayarları. |
| `index.html` | SPA kabuğu; Vite `main.tsx` girişi. |

### `src/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `main.tsx` | React root; **`HashRouter`** (statik hostingte deep link için ekstra redirect dosyası gerekmez). |
| `App.tsx` | Rotalar: `/`, `/declarations`, `/declarations/new`, `/declarations/:id`; `AppLayout` içinde. |
| `index.css` | Global stiller. |
| `vite-env.d.ts` | `import.meta.env` için `VITE_*` tip tanımları. |

### `src/config/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `appEnv.ts` | `VITE_API_BASE` normalizasyonu (sondaki `/api` kırpma), `companyId()` / `userId()`; build’e gömülür, gizli değildir (yorumda güvenlik notu). |

### `src/api/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `apiClient.ts` | `fetch` + `x-company-id` / `x-user-id`; JSON ve multipart yardımcıları; `ApiError`. |
| `declarationApi.ts` | Beyanname API çağrıları (`/api/declarations/...`). |
| `documentApi.ts` | Belge API çağrıları. |

### `src/types/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `declaration.types.ts` | Beyanname DTO / liste tipleri (API ile uyumlu). |
| `document.types.ts` | Belge tipleri. |

### `src/pages/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `DashboardPage.tsx` | Özet / giriş sayfası. |
| `DeclarationsPage.tsx` | Beyanname listesi. |
| `NewDeclarationPage.tsx` | Yeni beyanname oluşturma. |
| `DeclarationDetailPage.tsx` | Tek beyanname detay, adımlar, belgeler, XML vb. |

### `src/components/layout/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `AppLayout.tsx` | Outlet + ortak çerçeve. |
| `Header.tsx` / `Sidebar.tsx` | Üst menü / yan navigasyon. |

### `src/components/declarations/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `DeclarationTable.tsx` | Tablo listesi. |
| `DeclarationStatusBadge.tsx` | Durum rozetleri. |
| `DeclarationStepActions.tsx` | Çıkarım / normalizasyon / doğrulama / XML adım butonları. |
| `NormalizedDataForm.tsx` | Normalize alanların form düzenlemesi. |
| `GoodsLinesTable.tsx` | Kalem tablosu. |
| `SourceTracePanel.tsx` | Alan kaynağı izleme. |
| `ValidationPanel.tsx` | Doğrulama sonuçları. |
| `XmlPanel.tsx` | XML indir / önizleme. |

### `src/components/documents/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `DocumentUploadPanel.tsx` | Dosya yükleme UI. |
| `DocumentList.tsx` | Yüklenen belgeler listesi. |

### `public/`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `.gitkeep` | Boş `public` klasörünün repoda kalması (isteğe bağlı statik varlıklar buraya). |

### `frontend/.env` / `.env.example`

| Dosya | Ne işe yarar? |
|--------|----------------|
| `.env` | Yerel `VITE_*` (commit edilmez). |
| `.env.example` | Şablon; ayrıntı için kök `env.example`. |

### `frontend/dist/`

Vite `build` çıktısı — statik hostinge yüklenen klasör (`npm run build:frontend` ile üretilir).

---

## Tipik komutlar (kökten)

| Komut | Sonuç |
|--------|--------|
| `npm run dev` | Backend `tsx watch` (API). |
| `npm run dev:web` | Sadece Vite dev sunucusu (`frontend/`). |
| `npm run build` | API → `dist/`. |
| `npm run build:web` | Ön yüz build (önce `frontend`’de `npm install` gerekir). |
| `npm run build:frontend` | `frontend` içinde `npm ci` + `vite build` → `frontend/dist/`. |
| `npm start` | `node dist/index.js` (**önce** `npm run build`). |

---

## İstek özeti (mantık)

1. Tarayıcı `HashRouter` ile `/#/...` yollarını kullanır.  
2. `apiClient` `VITE_API_BASE` + `/api/...` ile API’ye gider; header’da `x-company-id`.  
3. API `authContext` ile firmayı doğrular (şimdilik header tabanlı; üretimde JWT + üyelik önerilir).  
4. Beyanname ve belgeler MongoDB’de; dosyalar `uploads/` altında.

---

## Bu belge

`PROJE-YAPISI.md` — repoda yapının hızlı haritası; kod değiştikçe dosya eklenip çıkarıldıkça bu listeyi güncel tutmak iyi olur.
