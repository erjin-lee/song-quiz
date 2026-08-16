# Git Workflow

## Branches
- Never make code changes directly on main, master, or develop.
- Create a task-specific branch before modifying files.
- Infer branch type from the task:
    - feature: feat/
    - bug: fix/
    - refactoring: refactor/
    - docs: docs/
    - tests: test/
    - maintenance: chore/
- Use lowercase kebab-case.

## Commits
Use Conventional Commits:

<type>(<optional-scope>): <description>

Allowed types:
feat, fix, refactor, perf, test, docs, build, ci, chore

- Write commit messages in Korean.
- Do not mention Claude or AI.
- Stage only changes related to the current task.

## Before committing

- Review git diff.
- Run relevant tests, lint, and type checks.
- Do not commit if checks fail.

## Push

After a successful commit:

git push -u origin HEAD

Never force push.