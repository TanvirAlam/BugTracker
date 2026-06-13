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
cp .env.example .env   # then set GITHUB_TOKEN
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
2. That route runs server-side inside Vite's dev/preview server. It reads
   `GITHUB_TOKEN` from your local environment and calls the GitHub REST API to
   create the issue in the selected repository.
3. The token stays on the server and is **never** shipped to the browser.

The issue body captures the environment, severity, type, priority, description,
and steps to reproduce. Labels include `bug`, the environment (`stage`/`live`),
`severity:*`, and `type:*`.

### Configure the GitHub token

Set `GITHUB_TOKEN` in `.env` to a token allowed to create issues on the target
repositories. Use one of:

- a classic Personal Access Token with the `repo` scope, or
- a fine-grained token with **Issues: Read and write** on each repo below.

Restart the dev server after changing `.env`.

### Repositories

The client only submits a project id; the server resolves it to a repo from a
fixed allowlist (`src/projects.ts`), so arbitrary repos can never be targeted.

- Foodime → `FoodimeRepo/foodime`
- Soundmade → `soundmade-com/soundmade-old`
- WeWaive → `wewaive/wewaive`
- Kiibee → `kiibee-app/kiibee`

## Deploying to a public host

`vite preview` is intended for local/internal use. For a public deployment,
host the `/api/bugs` handler (the logic in `vite.config.ts`) as a serverless
function or small Node server with `GITHUB_TOKEN` set in its environment, and
serve the static `dist/` separately. Never expose the token to the browser.
