## GitHub
When creating pull requests, create ready-for-review PRs by default.
Do not create draft PRs unless explicitly requested.
When creating pull requests, always create the PR from the original feature branch whenever possible.

## Git Branching
Feature branches are always branched from `main`, no exceptions unless explicitly requested by the user.
Never merge or rebase to or from a feature branch unless explicitly requested by the user.
Never merge or rebase `dev` into `main`; promote changes to `main` through feature branches or explicit cherry-picks instead.

## Commits
Commit changes as needed, using focused commits with clear messages.
