# GitHub Branch Protection Checklist

Repository: `opemati90/anstoss`

This is the exact GitHub branch protection configuration for the CI/CD setup in this repository.

## Current Limitation

As of 2026-03-24, live application of branch protection to this repository fails with GitHub API `HTTP 403`:

`Upgrade to GitHub Pro or make this repository public to enable this feature.`

This repository is currently private, so branch protection cannot be enforced on GitHub Free for this repo.

## Current Remote Branch State

The remote now has these branches:

- `ans-5/monorepo-scaffold`
- `develop`
- `main`

The current GitHub default branch is still:

- `ans-5/monorepo-scaffold`

## Before You Apply

- Ensure the workflows in `.github/workflows/quality.yml`, `.github/workflows/deploy-api.yml`, and `.github/workflows/deploy-mobile.yml` are already pushed to GitHub.
- Ensure the branch names you want to protect are:
  - `develop`
  - `main`

GitHub's branch protection UI allows creating a rule even if the branch does not exist yet. This is documented in GitHub's branch protection docs.

## Exact Rules To Create

Create two branch protection rules in:

`Repository Settings -> Branches -> Add rule`

### Rule 1: `develop`

Branch name pattern:

- `develop`

Enable these settings:

- `Require a pull request before merging`
- `Require approvals`: `1`
- `Dismiss stale pull request approvals when new commits are pushed`
- `Require approval of the most recent reviewable push`
- `Require status checks to pass before merging`
- `Require branches to be up to date before merging`
- `Require conversation resolution before merging`
- `Do not allow bypassing the above settings`

Leave these disabled:

- `Require review from Code Owners`
- `Require signed commits`
- `Require linear history`
- `Require merge queue`
- `Require deployments to succeed before merging`
- `Lock branch`
- `Allow force pushes`
- `Allow deletions`

Required status checks to select:

- `Lint`
- `Typecheck`
- `Shared Tests`
- `Mobile Tests`
- `API Tests`
- `Build`

### Rule 2: `main`

Branch name pattern:

- `main`

Enable these settings:

- `Require a pull request before merging`
- `Require approvals`: `1`
- `Dismiss stale pull request approvals when new commits are pushed`
- `Require approval of the most recent reviewable push`
- `Require status checks to pass before merging`
- `Require branches to be up to date before merging`
- `Require conversation resolution before merging`
- `Do not allow bypassing the above settings`

Leave these disabled:

- `Require review from Code Owners`
- `Require signed commits`
- `Require linear history`
- `Require merge queue`
- `Require deployments to succeed before merging`
- `Lock branch`
- `Allow force pushes`
- `Allow deletions`

Required status checks to select:

- `Lint`
- `Typecheck`
- `Shared Tests`
- `Mobile Tests`
- `API Tests`
- `Build`

## Recommended Merge Policy

- Merge feature branches into `develop`.
- Merge only release-ready changes from `develop` into `main`.
- Do not push directly to `develop` or `main`.
- Keep `production` deployments sourced only from `main`.

## After GitHub Auth Is Fixed

Once the repository is either public or the account is upgraded to GitHub Pro or higher, protection can be applied from the CLI.

Because the current GitHub UI exposes every option directly and some settings are easier to verify visually, the UI path above is the safest exact application method for this repository.

## Sources

- GitHub says branch protection rules can require pull requests, approvals, status checks, conversation resolution, and related merge restrictions: [Managing a branch protection rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- GitHub documents the protected-branch REST API and the `required_status_checks`, `required_pull_request_reviews`, `enforce_admins`, and `required_conversation_resolution` protection fields: [REST API endpoints for protected branches](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28)
