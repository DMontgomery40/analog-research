# analog-research Repo Instructions

This file adds the repo-specific rules for this repository. Keep it narrow and do not restate global Codex policy here.

## Branch Hygiene

These rules are mandatory.

- Any branch that is still active must track an upstream branch.
- Push new branches with upstream configured immediately: `git push -u origin <branch>`.
- If a branch exists locally but is missing tracking information, fix it immediately: `git branch --set-upstream-to=origin/<branch> <branch>`.
- Once work has been committed, pushed, and merged, and no further changes are planned, delete the local branch: `git branch -d <branch>`.
- Do not leave merged or abandoned local branches around as rubbish that can be mistaken for active work.
