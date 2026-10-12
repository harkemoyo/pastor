---
name: safe-git
description: Use before any git command that could discard work (checkout, reset, clean, restore, stash drop, revert) or when the user says they messed up or wants to go back to an earlier state in the Pastors LMS.
---

# Safe git recovery

Untracked files (such as new `AGENTS.md` and `.agents/`) are **not recoverable** after `git clean`, `git checkout .` or `git reset --hard`. Protect work first.

## Steps
1. **Look before acting:** `git status --short`, `git log --oneline -n 10`, `git stash list`, and `git diff --stat`.
2. **Ask what "back" means** if it is unclear: last commit, an older commit, or undo one file.
3. **Save first:** use `git stash push -m "<what>" -- <path>` for specific files. Use a new branch or commit for larger work. Never run `git stash -u` or `git clean` without saying what it will include.
4. **Target by path.** Revert only the files the user means. Do not touch `.agents/`, `AGENTS.md`, or `.env`.
5. **Verify** with `git status` afterwards and tell the user how to undo it (`git stash pop`, `git reflog`).
6. **Never** force-push, `reset --hard`, or delete branches without explicit confirmation. Never commit `.env` or `cookies.txt`.
