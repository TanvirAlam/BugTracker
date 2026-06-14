# Goal
Implement the 10 requested changes to the BugTracker (React + TS SPA with a Vite-embedded `/api/bugs` GitHub-Issues backend). No database; issues are GitHub issues.
# Assumptions (clarifying questions were skipped — using recommended defaults)
* Tester identity: add a **Your name** field to the login screen, kept in `sessionStorage` for the session.
* New issue title format: `BUG: <name> — <title>` (composed server-side; a leading `bug`/`bugs:` typed by the tester is stripped to avoid duplication).
* Item 10: add **both** a Device selector (Mac / Windows / Android / iOS / Web) and a Platform selector (Web / Mobile / Admin).
* PR number: **auto-detect** linked PRs from GitHub via a GraphQL query on load (REST list kept as a fallback).
# Current state
* `src/components/LoginScreen.tsx` (project + shared password), `Root.tsx` (auth gate, sessionStorage), `Dashboard.tsx` (create form + My Bugs table).
* `src/types/bug.ts` (`IssueRow`, `STATUS_TABS` incl. `Review`, constants), `src/utils/bugs.ts` (`deriveStatus/Severity`, `timeAgo`).
* `vite.config.ts` `/api/bugs`: `GET` list (REST, drops PRs) + `POST` create. Per-repo tokens read server-side only.
# Proposed changes
## Server — `vite.config.ts`
* Extend `BugPayload` with `tester`, `device`, `platform`, and (for updates) `number`, `action`.
* `createBugIssue`: compose canonical title `BUG: <name> — <cleanTitle>`; add `device:*` / `platform:*` labels and Device/Platform/Reported-by lines to the issue body.
* Replace `listBugIssues` with a GraphQL query (`repository.issues`, first 50 by `UPDATED_AT`) returning per issue: number, title, state (lowercased), url, updatedAt, labels, `assignee` (first assignee login), and linked `pr`/`prUrl` (from `timelineItems` CROSS_REFERENCED_EVENT where source is a PullRequest). Keep the existing REST list as a fallback if GraphQL errors (PR shown as none).
* Add `updateBugIssue` + a `PATCH /api/bugs` branch handling two actions: `close-mistake` (add `mistakenly-created` label, close with reason not_planned) and `reopen` (reopen + add `reopened` label). Missing labels are auto-created by GitHub when added.
## Types/utils — `src/types/bug.ts`, `src/utils/bugs.ts`
* `IssueRow` gains `assignee: string | null`, `pr: number | null`, `prUrl?: string`.
* Remove `Review` from `BugStatus` and `STATUS_TABS`; drop the review branch in `deriveStatus` (item 4).
* Add `TESTER_NAME_KEY` storage-key constant.
## Login — `src/components/LoginScreen.tsx`, `Root.tsx`
* Add required **Your name** input; `onLogin(projectId, name)`.
* `Root`: persist/clear name in `sessionStorage`, pass `testerName` to `Dashboard`; top bar shows the tester name + project.
## Create form — `src/components/Dashboard.tsx`
* Send `tester`, `device`, `platform` in the create payload (item 3 + 5 via title; item 10).
* Add Device + Platform selects (item 10).
## My Bugs table — `src/components/Dashboard.tsx`
* Remove **View All** + **Filters**; add a **search box** in the panel head filtering rows by title/assignee (items 6, 9).
* Add **Assignee** (item 1) and **PR** (item 2) columns; PR links to the PR when present, else `—`.
* Tester name appears before the title via the composed GitHub title (item 5).
* Per-row actions (item 7, 8): **Close (mistake)** for open rows, **Reopen** for closed rows, plus the existing open-in-GitHub link; a small inline error surface for action failures; reload after success. Update note-row `colSpan` to the new column count.
## Styles — `src/styles.css`
* Styles for the search box and the new row-action buttons (reopen / danger), matching existing tokens.
# Item → change map
1 Assignee column · 2 PR column (GraphQL) · 3 `BUG:` title prefix (server) · 4 remove Review · 5 tester name in title + top bar · 6 search box · 7 Close-as-mistake action+label · 8 Reopen action+label · 9 remove View All/Filters · 10 Device + Platform selectors.
# Validation
* `npm run build` (tsc + vite) must pass. Manual: login requires name; create bug shows `BUG: <name> — …`; table shows Assignee/PR, search filters, Review gone, Close(mistake)/Reopen update GitHub and refresh.
