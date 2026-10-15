# Git Workflow and Repository Governance

## Repository facts

- Repository: `https://github.com/codingbotlab/mayzicai-platform`
- Visibility: public
- Default branch: `main`
- Local workspace: `D:\META_D\02_PRODUCTS\MAYZICAI`
- Public landing page: `https://codingbotlab.github.io/mayzicai-platform/`

## Rules

1. Do not run Git commands from a parent folder or another project. Confirm the working directory first.
2. Keep commits focused: one logical change per commit.
3. Do not commit private meter data, logs, database files, credentials, tokens, `.env` files, or customer data.
4. Assume all committed content and history are public.
5. Never force-push, rewrite shared history, delete remote branches, or push directly to a different repository without explicit approval.
6. Do not push untested code or mark a test complete without evidence.
7. Keep generated artifacts and local runtime data out of source control.

## Safe change sequence (PowerShell)

Run these commands from the workspace:

```powershell
Set-Location 'D:\META_D\02_PRODUCTS\MAYZICAI'
git status --short --branch
git branch --show-current
git log -5 --oneline --decorate
git diff --check
git diff
```

After editing, inspect changed and untracked files:

```powershell
git status --short
git diff --check
git diff --stat
git diff
```

Stage explicit paths rather than using `git add .`:

```powershell
git add README.md PRIVACY.md TEST_PLAN.md meter/README.md docs/GIT_WORKFLOW.md docs/DECISIONS.md
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Before committing, inspect the staged filenames and search staged content for likely secrets. Do not paste secret values into chat or logs. If any credential may have been exposed, stop and rotate it.

Use a descriptive conventional commit subject, for example:

```text
docs: establish repository governance and privacy rules
```

Then commit and push only after checks pass:

```powershell
git commit -m "docs: establish repository governance and privacy rules"
git push origin main
git status --short --branch
git log -1 --oneline --decorate
```

## Commit message style

Use `type: concise imperative summary`.

- `docs:` documentation and workflow guidance
- `feat:` new user-facing capability
- `fix:` bug fix
- `test:` tests and test infrastructure
- `refactor:` behavior-preserving restructuring
- `build:` build, CI, and tooling changes
- `security:` security or privacy hardening

## Branch policy

For small documentation-only changes, a direct commit to `main` may be acceptable after review. For application code or risky changes, create a feature branch, test it, and merge through a reviewed pull request. Never bypass checks to make a deployment appear successful.

## Release record

After each push, record the commit hash, checks run, deployment result, and any remaining limitations in `TEST_PLAN.md` or a release note. A successful Git push does not prove that the application works in production.
