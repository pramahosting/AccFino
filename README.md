# HSLedger v2.0 — React UI

The original HSLedger codebase is **unchanged**. A new React/Vite frontend has been added alongside the existing Streamlit app. Both run simultaneously.

---

## Quick Start (Windows)

```
double-click start_react.cmd
```

This opens 4 terminal windows:

| Window | URL | Purpose |
|--------|-----|---------|
| React UI      | http://localhost:3000 | ✅ New professional React UI |
| React API     | http://localhost:8001 | FastAPI bridge for React |
| DB API        | http://localhost:8000 | Original FastAPI (unchanged) |
| Streamlit UI  | http://localhost:8501 | Original Streamlit (unchanged) |

---

## Quick Start (Mac / Linux)

```bash
chmod +x start_react.sh
./start_react.sh
```

---

## What's new (React frontend)

| Module | React UI | Streamlit |
|--------|----------|-----------|
| Login / Register | ✅ Full | ✅ Full |
| Dashboard | ✅ Summary stats | — |
| **Reconciliation** | ✅ **Full** — upload, classify, GST, edit, export, sessions | ✅ Full |
| Open Banking | Link to Streamlit | ✅ Full |
| Crypto Trading | Link to Streamlit | ✅ Full |
| Invoice Generator | Link to Streamlit | ✅ Full |
| Invoice Extractor | Link to Streamlit | ✅ Full |
| Cash Flow Forecast | Link to Streamlit | ✅ Full |
| Admin / ML Classifier | ✅ User management | ✅ Full train UI |

The Reconciliation module is **fully reimplemented** in React with identical functionality:
- 📥 Upload multiple bank CSVs per account (drag & drop)
- 🟢🔵🟡 Internal / Incoming / Outgoing classification
- 💰 GST calculation with category dropdowns (inline editable)
- 📊 GL Account dropdowns (inline editable)
- 🤖 Auto-Classify GL+GST using ML models
- 📆 Monthly summary with grand totals
- ➕ Add / ✏️ Edit / 🗑️ Delete rows
- 💾 Save session (pickle) + Save to DB
- 📥 Export to colour-coded Excel workbook
- 📂 Load past sessions

---

## New files added

```
HSLedger/
├── main_app/
│   └── react_api.py          ← New FastAPI bridge (port 8001)
├── react_frontend/            ← New React app
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── DashboardPage.jsx
│       │   ├── ReconciliationPage.jsx
│       │   ├── AdminPage.jsx
│       │   └── (stub pages for other modules)
│       ├── components/
│       │   ├── layout/Layout.jsx
│       │   └── reconciliation/
│       │       ├── InputPanel.jsx
│       │       └── OutputPanel.jsx
│       ├── hooks/useAuth.jsx
│       ├── lib/api.js
│       └── styles/globals.css
├── start_react.cmd            ← New Windows launcher
├── start_react.sh             ← New Unix launcher
└── app.cmd                    ← Original launcher (still works)
```

---

## Login

Same credentials as before. The React login calls the same `/auth/login` endpoint on port 8001, which uses the same `hsledger.db` SQLite database.

Default test user from first run: `admin` role is assigned to the first registered user.

---

## Design

- **Colours**: Deep navy `#1B3A6B` + teal `#0099A8` (MYOB-inspired)
- **Fonts**: DM Sans (body) + DM Mono (amounts/codes)
- Sticky table headers, colour-coded transaction rows, inline GL/GST dropdowns
- Collapsible sidebar, responsive layout
