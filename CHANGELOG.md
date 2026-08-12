# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-08-12

### Fixed

- Ensure README is listed in the published package `files` (npmjs.com Readme tab was blank after staged 2.0.0 publish despite README in the tarball)

## [2.0.0] - 2026-08-11

### Added

- `lookup` — prefixed get-by-id or `/search-v3` free-text/email search
- `search-tools`, `describe-tool`, `call-api` — progressive discovery over the in-package API catalog
- Credit-note and other previously missing read operations via the catalog

### Changed

- MCP tool surface is discovery-first (~5 core tools) instead of one tool per endpoint
- Removed misleading date-filter `queryParams` from catalog list entries (`call-api` only forwards pagination and sort params)
- Multi-env calls omit `environment` → first sandbox (never production); `environment=sandbox` aliases to that sandbox
- Sharper tool/`help` guidance (when to use `lookup` vs catalog vs customer summary)
- `call-api` normalizes `order` to `ASC`/`DESC` and accepts `orderBy` as `order_by`

### Removed

- `get-account`, `get-account-by-email`, `get-subscription`, `get-invoice`, `get-payment`, `get-rate-plan`
- Legacy `search` local company-name scan and `/accounts/email/…` path
- Dedicated `list-*` MCP tools (use catalog + `call-api`)

### Migration

| Old | New |
|-----|-----|
| `get-account` / `get-invoice` / … | `lookup` with the ID |
| `get-account-by-email` | `lookup` with the email |
| `search` | `lookup` (search-v3) |
| `list-payments` etc. | `search-tools` → `call-api` |

## [1.3.0] and earlier

Versions before 2.0.0 used dedicated per-endpoint MCP tools. See git history for details; only 2.0.0+ is documented here.
