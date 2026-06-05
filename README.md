# Travel Sheet App

Single-user Angular app that generates a Bulgarian travel sheet ("Пътен лист") into Google Sheets for one month at a time. For architecture and domain rules see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Prerequisites

- Node ≥ 20, npm ≥ 11
- A Google account with access to Google Drive and Google Sheets
- A Firebase project with **Authentication → Google sign-in** enabled
- A Google Cloud OAuth 2.0 Web Client ID (same project as Firebase)
- Firebase CLI: `npm install -g firebase-tools`

---

## 1 — Google Drive setup

Create the following three items in your Google Drive, using **exactly** these names (the app resolves them by name at runtime):

| Item | Type | Name |
|---|---|---|
| Container folder | Drive folder | `Travel Sheets 2026` |
| Master data | Google Sheets spreadsheet | `SupportingSpreadsheet` |
| Output workbook | Google Sheets spreadsheet | `Pytni_Lista_2026_m01-m12` |

Place all three inside the container folder.

### SupportingSpreadsheet tabs

The spreadsheet must have five tabs with headers in row 1 and data from row 2. Column order (0-based) matches `src/app/core/config/supporting.map.ts`:

| Tab | Key columns |
|---|---|
| `Company` | Id, Name, EIK, Address, ReportingYear |
| `Vehicle` | Id, CompanyId, Name, RegistrationNumber, FuelType, SeatCount, AvgConsumptionL/100km, TankCapacityL, **IsActive** (TRUE/FALSE), OpeningFuelBalance |
| `Location` | Id, CompanyId, Name, Type (`office`/`destination`), NameBg, Address |
| `Route` | Id, RouteName, StartPointId, EndPointId, DistanceKm |
| `Invoice` | Id, CompanyId, ReportingYear, VehicleId, FuelVendor, InvoiceDate, QuantityLiters, UnitPrice, TotalAmount, Currency, DriveFileId |

The output workbook should be created empty — the app adds a tab per generated month.

---

## 2 — Firebase & OAuth setup

### Firebase project
1. In [Firebase Console](https://console.firebase.google.com) → Authentication → Sign-in method, enable **Google**.
2. Copy the **web app config** (apiKey, authDomain, projectId, …) into `src/environments/environment.ts` (production) and `src/environments/environment.development.ts` (local dev). The web config is not secret.

### Google OAuth client
1. In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials, create (or reuse) a **Web application** OAuth 2.0 client.
2. Add authorized JavaScript origins:
   - `http://localhost:5000` (local dev)
   - `https://<your-firebase-project>.web.app` (production)
3. Copy the **Client ID** into both environment files as `googleOAuthClientId`.

### Firebase Auth authorized domains
In Firebase Console → Authentication → Settings → Authorized domains, add:
- `localhost`
- `https://latituderealize-travel-sheet.web.app`

---

## 3 — Commands

```bash
npm install          # install dependencies

npm start            # dev server at http://localhost:5000
ng test              # unit tests (Vitest)
ng lint              # ESLint
ng build             # production build → dist/travel-sheet-app/browser

npm run deploy       # production build + firebase deploy --only hosting
```

---

## 4 — First deploy

```bash
firebase login
npm run deploy
```

The app is hosted at `https://latituderealize-travel-sheet.web.app`.
