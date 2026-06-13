# AccFino — Northflank Deployment Guide

## Prerequisites
- Northflank account (northflank.com)
- Neon PostgreSQL database (neon.tech — free tier works)

## Step 1 — Create Neon Database
1. Go to [neon.tech](https://neon.tech) → Create project
2. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)

## Step 2 — Create Northflank Project
1. Northflank dashboard → New Project → name it `accfino`

## Step 3 — Create Combined Service
1. Inside project → Add Service → Combined Service
2. Name: `accfino-app`
3. Source: Git repository (connect your GitHub/GitLab) OR upload zip

## Step 4 — Configure Build
- **Dockerfile path**: `/Dockerfile`
- **Build context**: `/`
- Northflank auto-detects multi-stage build

## Step 5 — Set Environment Variables (CRITICAL)
In the service → Environment tab, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| `PORT` | `8001` |
| `PYTHONIOENCODING` | `utf-8` |
| `PYTHONWARNINGS` | `ignore` |

Optional (add your Northflank domain for CORS):
| `CORS_ORIGINS` | `https://accfino--accfino-app.code.run` |

## Step 6 — Configure Port
- Internal port: `8001`
- Public: Yes
- Protocol: HTTP

## Step 7 — Health Check
- Path: `/ready`
- Port: `8001`
- Initial delay: `120` seconds (ML models take time)
- Period: `20` seconds

## Step 8 — Deploy
Click Deploy → wait 3-5 minutes for:
1. Docker build (React compile + Python install)
2. Container start
3. ML model loading (30-90 seconds)
4. Health check passes → traffic flows

## Step 9 — Verify
Visit your Northflank URL → should see AccFino login page.

Login:
- Email: `admin@accfino.com`
- Password: `Accfino@1`

## Session Data
By default, session data (uploaded files + results) lives in `/app/main_app/data/` inside the container. This is **ephemeral** — lost on redeploy.

To persist session data, add a Northflank volume:
- Mount path: `/app/main_app/data`
- Size: 1–5 GB

## Troubleshooting

| Issue | Fix |
|---|---|
| Build fails | Check Dockerfile — ensure `package-lock.json` exists |
| `DATABASE_URL not set` | Add env var in Northflank → Environment |
| 503 on health check | Wait longer — ML models loading. Increase initial delay to 180s |
| CORS errors | Add `CORS_ORIGINS=https://your-domain.code.run` env var |
| Company DB empty | Run seed: connect to container and run `python seed_neon.py` |
| Session data lost | Add persistent volume at `/app/main_app/data` |
