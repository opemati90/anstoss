# CI/CD and Branching

This repository now uses a two-stage branch model:

- `develop` is the shared development branch. Feature, fix, and chore branches should target `develop`.
- `prod` is the production branch. Only release-ready changes should merge into `prod`.

Recommended working branches:

- `feature/<ticket-or-scope>`
- `fix/<ticket-or-scope>`
- `chore/<ticket-or-scope>`
- `release/<version>`
- `hotfix/<ticket-or-scope>`

## Workflow Overview

- `.github/workflows/quality.yml`
  - Runs on pull requests into `develop` and `prod`, plus pushes to those branches.
  - Enforces `Lint`, `Typecheck`, `Shared Tests`, `Mobile Tests`, `API Tests`, and `Build`.
- `.github/workflows/deploy-api.yml`
  - Deploys the API to Railway after pushes to `develop` or `prod` when API-related files change.
  - `develop` deploys to the GitHub `development` environment.
  - `prod` deploys to the GitHub `production` environment.
- `.github/workflows/deploy-mobile.yml`
  - Allows manual EAS development/preview builds on `develop`.
  - Triggers EAS production builds on pushes to `prod`.

For the exact GitHub settings to apply in the repository UI, see `docs/github-branch-protection.md`.

## Required GitHub Settings

Protect both `develop` and `prod` in GitHub repository settings.

Enable these branch protection rules:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require conversation resolution before merging.
- Dismiss stale approvals when new commits are pushed.
- Block direct pushes to protected branches.

Set these required checks on both protected branches:

- `Lint`
- `Typecheck`
- `Shared Tests`
- `Mobile Tests`
- `API Tests`
- `Build`

Recommended approval policy:

- `develop`: at least 1 approval.
- `prod`: at least 1 approval and use a release or hotfix PR from `develop` or `hotfix/*`.

## GitHub Environments

Create two GitHub environments:

- `development`
- `production`

Recommended environment protections:

- `production`: require reviewers before deployment.
- `development`: no manual approval, but keep secrets scoped here instead of repository-wide.

### Environment Secrets

Set these secrets in both GitHub environments:

- `RAILWAY_TOKEN`
  - Railway project token scoped to the target environment.
- `RAILWAY_API_SERVICE`
  - Railway service name or service ID for the API service.
- `EXPO_TOKEN`
  - Expo personal access token with access to the `opemati1521/anstoss` EAS project.

## Merge Flow

1. Branch from `develop` for normal work.
2. Open a pull request into `develop`.
3. Wait for all quality gates to pass.
4. Merge into `develop` to deploy the API to the development environment. Trigger preview mobile builds manually when needed.
5. Open a release PR from `develop` into `prod`.
6. Wait for the same quality gates.
7. Merge into `prod` to deploy production API changes and trigger a production mobile build.

## Notes

- The API deploy workflow uses Railway CLI project tokens, which are designed for CI/CD deployments.
- The mobile deploy workflow uses Expo's official GitHub Action and EAS build profiles already defined in `apps/mobile/eas.json`.
- EAS production builds may require app-store credentials to be configured once in Expo before fully unattended production builds succeed.
