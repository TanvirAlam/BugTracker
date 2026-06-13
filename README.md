# BugTracker

Single page React + TypeScript bug reporting dashboard for multiple monorepo projects.

## Features

- Tester login/profile area
- Create bug form with project/repository, environment, severity, type, priority, screenshots/log upload UI
- Files bugs **directly as GitHub Issues** (no database)
- Bug list with filters and statuses
- KPI cards, bug charts, and activity feed
- Repository mapping for four running projects

## Run locally

```bash
npm install
cp .env.example .env   # then set the per-repo tokens
npm run dev
```

## Build & run the production preview

```bash
npm run build
npm run preview
```

`npm run preview` serves the built app **and** the `/api/bugs` route, so bug
creation works the same as in dev.

## How bug creation works (no database)

There is no database — a submitted bug **is** a GitHub Issue.

1. The browser form posts the bug to `POST /api/bugs`.
2. That route runs server-side inside Vite's dev/preview server. It picks the
   token for the selected project (e.g. `FOODIME_TOKEN`) from your local
   environment and calls the GitHub REST API to create the issue in that repo.
3. Tokens stay on the server and are **never** shipped to the browser.

The issue body captures the environment, severity, type, priority, description,
and steps to reproduce. Labels include `bug`, the environment (`stage`/`live`),
`severity:*`, and `type:*`.

### Configure the GitHub tokens

Each repository uses its own token, read from these environment variables (in
`.env` or your shell). Every token must be allowed to create issues on its repo
— a classic Personal Access Token with the `repo` scope, or a fine-grained
token with **Issues: Read and write** on that repo:

- `FOODIME_TOKEN` → `FoodimeRepo/foodime`
- `SOUNDMADE_TOKEN` → `soundmade-com/soundmade`
- `WEWAIVE_TOKEN` → `wewaive/wewaive`
- `KIIBEE_TOKEN` → `kiibee-app/kiibee`

Restart the dev server after changing `.env`. The client only submits a project
id; the server resolves the repo and token from that id (`src/projects.ts` +
`vite.config.ts`), so arbitrary repos can never be targeted.

## Deploying to a public host

`vite preview` is intended for local/internal use. For a public deployment,
host the `/api/bugs` handler (the logic in `vite.config.ts`) as a serverless
function or small Node server with the per-repo `*_TOKEN` values set in its
environment, and serve the static `dist/` separately. Never expose tokens to
the browser.
