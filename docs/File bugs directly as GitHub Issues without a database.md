# Goal
When a tester selects one of the 4 projects and an environment, clicking **Create Bug** should create a GitHub Issue directly in that project's repository. No database is used; the GitHub issue is the saved record.
# Current state
* The React form in `src/main.tsx` is static: project/environment fields are not controlled and **Create Bug** has no submit handler.
* `src/main.tsx:19` currently lists 3 repositories and needs the corrected 4-repo list.
* There is no backend/API endpoint, no `.gitignore`, and no env setup for a GitHub token.
* `README.md` already notes that GitHub issue creation should go through a backend/API route, not from browser code.
# Security constraint
Creating GitHub issues requires a token with write access. The token must stay server-side and must not be bundled into the Vite browser app. The client will send form data to `/api/bugs`; the server-side handler will read `GITHUB_TOKEN` from local environment variables and call GitHub.
# Proposed changes
## Shared repository mapping
Add `src/projects.ts` as a single source of truth for allowed projects:
* `foodime` → `FoodimeRepo/foodime`
* `soundmade` → `soundmade-com/soundmade-old`
* `wewaive` → `wewaive/wewaive`
* `kiibee` → `kiibee-app/kiibee`
The client will submit a project id only. The server resolves that id from this allowlist so users cannot submit arbitrary GitHub repositories.
## API endpoint
Add `vite.config.ts` with the React plugin and a small Vite middleware for `POST /api/bugs` in dev and preview. The endpoint will validate the payload, require `GITHUB_TOKEN`, and call `POST https://api.github.com/repos/{owner}/{repo}/issues` using Node's built-in `fetch`. The issue title will come from the bug title, and the issue body will include environment, severity, type, priority, description, and steps to reproduce. Labels will include `bug`, environment, severity, and type.
## Form behavior
Update `src/main.tsx` so the create form uses React state, shows the 4 repositories, toggles Stage/Live, submits to `/api/bugs`, displays a loading state, then shows either a success banner with the created issue link or an inline error. Because there is no database, disabling the GitHub auto-create checkbox will block submission with a helpful message explaining that GitHub issue creation is required to save the bug.
## Styles
Add small responsive-friendly styles for success/error messages and disabled/submitting buttons in `src/styles.css`.
## Secrets and docs
Add `.gitignore` to ignore `node_modules`, `dist`, and `.env*` while allowing `.env.example`. Add `.env.example` documenting `GITHUB_TOKEN=`. Update `README.md` to list the 4 repositories and explain that the token needs permission to create issues on those repos.
# Validation
Run `npm run build` to verify TypeScript and Vite compile. With a real token in `.env`, run `npm run dev`, submit a test bug, and confirm the issue appears in the selected GitHub repository.