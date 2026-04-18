# Fit4Me (Flowchart)

Canvas-based flowchart / mind-map tool with:

- React + TypeScript frontend (Vite)
- Vercel serverless functions under `api/` (Supabase + Figma + AI helpers)
- Supabase persistence (cloud) + localStorage persistence (local)

## Requirements

- Node.js **20.x** (project is configured for Node 20; other versions may work but aren’t guaranteed)
- Supabase project (for cloud save/load)
- Optional: Figma personal access token (for Figma import / previews)
- Optional: Anthropic / DeepL / Gemini keys (for AI/translation features)

## Setup

Install dependencies:

```bash
npm install
```

Create env file:

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local` (see below).

## Run locally

This app has **two processes** in dev:

- **Frontend**: Vite dev server
- **API**: Vercel dev server (serves `api/*` routes)

### 1) Start the API on port 3001

Install the Vercel CLI if you don’t already have it:

```bash
npm i -g vercel
```

Run the serverless functions on port **3001** (to match the Vite proxy in `vite.config.ts`):

```bash
vercel dev --listen 3001
```

### 2) Start the frontend

```bash
npm run dev
```

Now open the Vite URL (typically `http://localhost:5173`). Requests to `/api/*` will be proxied to `http://localhost:3001`.

## Typecheck

Frontend only:

```bash
npm run typecheck
```

API only:

```bash
npm run typecheck:api
```

Both:

```bash
npm run typecheck:all
```

## Environment variables

Copy `.env.example` → `.env.local`.

- **Supabase (required for cloud persistence)**
  - `Fit4Me_SUPABASE_URL`
  - `Fit4Me_SUPABASE_SERVICE_ROLE_KEY`
- **Figma (optional)**
  - `fit4me_FIGMA_TOKEN_API_KEY` (server-side fallback token; the UI can also accept a token input)
- **AI (optional)**
  - `Fit4Me_ANTHROPIC_API_KEY` (used by `POST /api/parse`)
- **Locale check translations (optional)**
  - `Fit4Me_DEEPL_API_KEY` (or `DEEPL_API_KEY`)
  - `Fit4Me_GEMINI_API_KEY` (fallback / required if DeepL is absent)

## Supabase schema / migrations

Migrations live in `supabase/migrations/`. The app expects a table named `flowchart_trees`.

At minimum you need:

- `id text primary key`
- `name text`
- `tree jsonb`
- `saved_at timestamptz`

See:

- `supabase/migrations/20260402000000_create_flowchart_trees.sql`
- `supabase/migrations/20260403000000_add_flow_name.sql`

## Deployment (Vercel)

- Frontend: Vite build output (`dist/`)
- API: Vercel serverless functions from `api/`

`vercel.json` is configured with `"framework": "vite"`.

