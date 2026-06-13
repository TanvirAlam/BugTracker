# BugTracker

Single page React + TypeScript bug reporting dashboard for multiple monorepo projects.

## Features

- Tester login/profile area
- Create bug form with project/repository, environment, severity, type, priority, screenshots/log upload UI
- Auto-create GitHub issue option
- Bug list with filters and statuses
- KPI cards, bug charts, and activity feed
- Repository mapping for three running projects

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
```

## GitHub issue creation

This frontend is ready for integration. Do **not** put a GitHub token in the browser. Add a backend/API route later that receives the form and creates the GitHub issue securely.

Suggested backend endpoint:

```http
POST /api/bugs
```

It should create a GitHub issue in the selected repository with labels like `bug`, `stage`, `high`, `technical`.
