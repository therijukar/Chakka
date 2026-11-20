# CLAUDE.md — Fleet & Trip Management App (India)

This document defines the architecture, coding conventions, domain rules, and commands for the offline-first, multi-language Indian truck fleet management monorepo.

---

## 1. Repository Structure

```text
.
├── CLAUDE.md
├── package.json              # Root scripts & npm workspaces
├── docker-compose.yml        # MySQL 8.0 + Redis + Backend
├── backend/                  # Node.js + TypeScript + Fastify + Prisma + MySQL 8.0
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── config/           # Env validation (Zod), constants
│       ├── lib/              # Prisma client, Redis client, logger
│       ├── middleware/       # JWT auth, role guard, driver permission guard
│       ├── routes/           # Fastify route plugins (auth, fleet, trips, expenses, emis, docs, webhooks)
│       ├── services/         # Business logic + pluggable storageService, ocrService, tollParserService
│       └── utils/            # INR formatting, Indian vehicle number normalization, date/expiry helpers
└── mobile/                   # React Native + Expo (TypeScript) — single app (Owner + Driver)
    └── src/
        ├── i18n/             # i18next config + locales/{en,hi,bn,mr,ta}.json
        ├── db/               # expo-sqlite schema, migrations, repositories
        ├── sync/             # Background Sync Queue worker, image compression, doc vault cache
        ├── api/              # Typed HTTP client with JWT refresh & offline awareness
        ├── navigation/       # Role-gated stacks (LanguagePicker -> Auth -> OwnerTabs | DriverStack)
        ├── screens/          # driver/ and owner/ screens
        ├── components/       # Shared UI (SyncBadge, BigActionButton, CurrencyText, StatusPill)
        └── utils/            # formatINR, validation, media helpers
```

---

## 2. Non-Negotiable Domain & Engineering Rules

### Currency & Numeric Precision
- **Database:** Every currency, freight, EMI, toll, fuel liter, and rate column in MySQL MUST use `@db.Decimal(12, 2)`. Never use `FLOAT` or `DOUBLE` for money or fuel.
- **Formatting:** Always format currency in Indian numbering format (`₹1,25,000`, `₹12,500.50`) using a shared `formatINR()` helper.

### Multi-Language (i18n)
- **Zero hardcoded UI strings** in `/mobile`. All visible text must use `useTranslation()` / `i18next`.
- Ship and maintain 5 locales in lockstep: `en` (English), `hi` (हिन्दी), `bn` (বাংলা), `mr` (मराठी), `ta` (தமிழ்).
- Any new translation key added to `en.json` must also be added to `hi.json`, `bn.json`, `mr.json`, and `ta.json`.

### Driver-First UX
- **Touch targets:** Minimum `56px` height for all driver interactive buttons and list rows.
- **Low-friction flows:** Maximum 2–3 taps for core actions (Start Trip, Add Fuel, Add Expense, End Trip, Truck Docs).
- **Fraud prevention:** Start/End Trip odometer photos MUST use **live camera only** (never gallery picker).
- **Sync visibility:** Every driver screen displays a persistent Sync Status indicator (`Green` = Synced, `Amber` = Saved Offline / Pending Sync).

### Offline-First & Idempotency
- Write trip events and expenses to local `expo-sqlite` **first** with a client-generated UUID (`client_id`) and `sync_status` (`PENDING` | `SYNCING` | `SYNCED` | `FAILED`).
- Compress captured photos locally to **<= 250 KB** (JPEG/WebP) immediately after capture via `expo-image-manipulator`.
- Background sync worker (triggered by `@react-native-community/netinfo`) pushes JSON payloads first, then uploads compressed images.
- Backend endpoints accepting offline writes (`trips`, `expenses`, etc.) MUST be **idempotent** using `@unique` `client_id` in MySQL—retrying the same `client_id` returns the existing record without creating duplicates.
- Document Vault files for a driver's assigned truck are automatically cached locally via `expo-file-system` when online for offline RTO/police inspection.

### Auth & Granular Permissions
- **Owner:** Phone + Password (bcrypt) -> JWT.
- **Driver:** Phone + 4-Digit PIN (bcrypt) -> JWT.
- **Per-Driver Permission Toggles** (enforced in both backend middleware and mobile UI):
  - `can_start_end_trip`
  - `can_add_fuel`
  - `can_add_other_expenses`
  - `can_view_own_bata_and_advance`
  - `can_view_toll_history`
  - `can_view_doc_vault`

### Pluggable Service Interfaces
- **Storage (`storageService`):** S3-compatible interface (Cloudflare R2 / AWS S3) with a local disk fallback (`./uploads`) for local development.
- **Vision OCR (`ocrService`):** Pluggable provider supporting `OCR_MODE=mock` (default for dev/tests) and `OCR_MODE=gemini` (Gemini Flash with strict JSON schema output) exposing:
  - `extractOdometer(imageBuffer)` -> `{ odometer_km, confidence }`
  - `extractFuelBill(imageBuffer)` -> `{ liters, rate_per_liter, total_amount, pump_name?, bill_date?, confidence }`
- **FASTag Inbound Email Webhook:** `POST /api/webhooks/inbound-email` parses ICICI, HDFC, SBI, IDFC, Airtel FASTag emails via regex templates + LLM fallback, matches `vehicle_number` to an active `trip_id` (or logs unassigned), and posts to the toll ledger.

### Analytics & Compliance Rules
- **Trip Net Profit:** `agreed_freight - (fuel_total + auto_tolls_total + approved_other_expenses)`.
- **True Mileage:** `(end_odometer_km - start_odometer_km) / total_fuel_liters`.
- **Mileage Red Flag:** Triggered when trip mileage drops `> 15%` below `vehicle.baseline_mileage_kmpl`.
- **Compliance Expiry Badges:**
  - **RED:** Expired (`< 0` days) or expiring within `<= 7` days.
  - **AMBER:** Expiring within `8–30` days.
  - **GREEN:** Valid (`> 30` days).

---

## 3. Coding Conventions

- **TypeScript:** `strict: true` everywhere; avoid `any`.
- **Validation:** Validate all API request bodies, query params, and env vars with `zod`.
- **Naming:**
  - Database columns: `snake_case` via Prisma `@map(...)` (tables mapped to plural `snake_case` via `@@map(...)`).
  - TypeScript variables/functions: `camelCase`; Types/Interfaces/Components: `PascalCase`.
  - API JSON payloads: `snake_case` or consistent DTOs documented per route (keep DB & API field names aligned to minimize mapping bugs—prefer `snake_case` for sync-critical fields like `client_id`, `vehicle_number`, `odometer_km`, `rate_per_liter`, `total_amount`).
- **Error Handling:** Centralized Fastify error handler returning `{ error: { code, message, details? } }`.
- **Testing:** `vitest` for backend unit/integration tests (especially idempotency, OCR mock, FASTag regex parsers, P&L & mileage calculations, compliance status).

---

## 4. Common Project Commands

### Infrastructure (Docker)
```bash
docker compose up -d              # Start MySQL 8.0 + Redis (+ backend if configured)
docker compose up -d mysql redis  # Start only MySQL 8.0 + Redis for local backend dev
docker compose down               # Stop services
docker compose down -v            # Stop and wipe database volumes
```

### Root & Workspace Commands
```bash
npm install                       # Install all workspace dependencies
npm run dev:backend               # Run Fastify backend in watch mode (tsx)
npm run dev:mobile                # Start Expo dev server
npm run build:backend             # Type-check & compile backend
npm run test:backend              # Run backend Vitest suite
```

### Database (Prisma + MySQL 8.0)
```bash
npm run db:generate               # Generate Prisma Client
npm run db:migrate                # Run Prisma dev migrations
npm run db:push                   # Push schema directly (prototyping)
npm run db:seed                   # Seed Indian sample data (owner, drivers, trucks, EMIs, docs)
npm run db:studio                 # Open Prisma Studio
```

### Phased Execution Policy
Always complete and verify one phase at a time before moving to the next:
1. **Phase 1:** Monorepo setup, Docker Compose (MySQL 8.0 + Redis), Prisma schema, seed data.
2. **Phase 2:** Backend APIs, Auth/RBAC, EMI & Compliance, Doc Vault, OCR service, FASTag webhook + tests.
3. **Phase 3:** Expo foundation, 5-language i18n + Language Picker, SQLite + Sync Queue + Offline Doc Vault cache.
4. **Phase 4:** Driver UI (Home, Live Camera Odometer, Fuel OCR, Quick Expense, Offline Doc Vault, Sync Queue).
5. **Phase 5:** Owner UI (Fleet/Drivers/Toggles, Trips & P&L, Mileage Alerts, Approvals, EMI Tracker, Compliance Dashboard, Doc Vault, FASTag Setup).
