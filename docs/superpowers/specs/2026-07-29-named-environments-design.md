# Named Billforward environments

**Date:** 2026-07-29

**Target version:** next backward-compatible feature release

## Problem

The MCP currently models exactly two environment names: `sandbox` and
`production`. Billforward can provide multiple sandboxes, and different users
may organize them as `dev`, `staging`, `qa`, `demo`, or other names. A fixed
enum cannot represent those setups.

The change must support any practical number of named environments without
requiring current users to edit their MCP configuration. Write access must be
controlled independently for each new environment.

## Configuration

Add one optional environment variable, `BILLFORWARD_ENVIRONMENTS`, containing a
JSON object keyed by the names users want to pass to MCP tools:

```json
{
  "dev": {
    "token": "...",
    "type": "sandbox",
    "readonly": true
  },
  "staging": {
    "token": "...",
    "type": "sandbox",
    "readonly": true
  },
  "prod": {
    "token": "...",
    "type": "production",
    "readonly": true
  }
}
```

Each entry has:

- `token`: required non-empty string.
- `type`: required enum, either `sandbox` or `production`. It selects the
  existing default URL for that kind of Billforward environment.
- `readonly`: optional boolean. Omission means `true`; only the literal boolean
  `false` enables writes.
- `baseUrl`: optional absolute HTTP(S) URL. When present, it overrides the URL
  selected by `type` for that entry.

Environment names must be lowercase slugs matching
`^[a-z0-9][a-z0-9_-]*$`. They are passed unchanged in tool calls. This avoids
case-folding surprises and makes names safe to show in schemas and messages.

The complete MCP configuration stores the object as a JSON-encoded string:

```json
{
  "env": {
    "BILLFORWARD_ENVIRONMENTS": "{\"dev\":{\"token\":\"...\",\"type\":\"sandbox\",\"readonly\":true},\"staging\":{\"token\":\"...\",\"type\":\"sandbox\",\"readonly\":true},\"prod\":{\"token\":\"...\",\"type\":\"production\",\"readonly\":true}}"
  }
}
```

## Backward compatibility

All current configuration forms remain valid and keep their existing names:

- `BILLFORWARD_ACCESS_TOKEN` plus optional `BILLFORWARD_ENVIRONMENT`
- `BILLFORWARD_SANDBOX_ACCESS_TOKEN`
- `BILLFORWARD_PRODUCTION_ACCESS_TOKEN`
- `BILLFORWARD_SANDBOX_URL`
- `BILLFORWARD_PRODUCTION_URL`
- `BILLFORWARD_READ_ONLY`

Legacy and per-environment token variables produce the same `sandbox` and
`production` entries they produce today. Their write policy continues to come
from the global `BILLFORWARD_READ_ONLY`, whose safe default remains `true`.

Named entries and old entries are additive. Reusing `sandbox` or `production`
in `BILLFORWARD_ENVIRONMENTS` while the corresponding old token configuration
also exists is rejected as a duplicate instead of silently choosing one token.

Users who do not set `BILLFORWARD_ENVIRONMENTS` see no configuration or
behavior change. Existing calls with `environment: "sandbox"` or
`environment: "production"` remain valid.

## Resolution and client creation

`resolveEnvironments()` returns a map keyed by string environment names. Each
resolved value contains:

```ts
{
  token: string;
  baseUrl: string;
  type: "sandbox" | "production";
  readonly: boolean;
}
```

The resolver reads environment variables at call time, preserving the current
testability and lazy error behavior. It validates the entire named catalog
before returning it. Invalid JSON, invalid names, empty tokens, invalid types,
invalid booleans, invalid URLs, unknown fields, or duplicate names reject the
configuration with an actionable error that never includes token contents.

The environment-selection rules stay the same, generalized from two fixed
entries to any number:

| Requested environment | Configured environments | Result |
|---|---|---|
| A configured name | Any | Use that entry |
| An unknown name | Any | Error listing available names |
| Omitted | Exactly one | Use the only entry |
| Omitted | Two or more | Error requiring an explicit name |
| Omitted | None | Error explaining how to configure a token |

`getClient()` keeps its existing read-call signature and adds an optional write
intent:

```ts
getClient(environment?)
getClient(environment, { write: true })
```

For a write request, `getClient` resolves the environment and rejects a
read-only entry before creating or invoking an Axios client. Centralizing this
guard prevents a write handler from accidentally bypassing the environment's
policy.

## MCP tool behavior

The shared `environment` input changes from the fixed
`sandbox | production` enum to a validated string slug. It stays optional so
single-environment users continue to omit it.

Every API-reading handler continues to call `getClient(environment)`. Every
handler that can issue a POST, PUT, PATCH, or DELETE calls
`getClient(environment, { write: true })`.

Write tools must be registered even when all configured environments are
read-only. Their handlers return a clear read-only error for the selected
environment. This makes mixed configurations possible and keeps the tool list
stable when an operator changes a policy.

The `help` tool lists only environment name, type, and access mode, for example:

```text
dev: sandbox, read-only
staging: sandbox, read-only
prod: production, write-enabled
```

It never includes tokens or base URLs. When multiple environments exist, it
continues instructing the model to pass `environment` on every API tool call.

## Errors and security

Configuration errors are lazy: the MCP process still starts, and the first
tool that resolves environments returns the error. This preserves the current
zero-token startup behavior.

Messages may contain configured environment names, types, and access modes.
They must not contain tokens, catalog JSON, derived authentication parameters,
or base URLs.

Malformed or partially invalid catalogs fail as a whole. The resolver never
silently drops a bad entry or falls back to another environment, because that
could route a request to the wrong tenant.

`readonly` is fail-closed:

- missing means `true`;
- `true` blocks writes;
- literal `false` enables writes;
- strings such as `"false"` are invalid and do not enable writes.

## Testing

Tests will follow red-green-refactor and cover:

- parsing and selecting three or more arbitrary named environments;
- automatic selection with exactly one named environment;
- explicit selection and ambiguity with multiple named environments;
- sandbox/production default URLs and a custom `baseUrl`;
- omitted `readonly` defaulting to `true`;
- `readonly: true` blocking writes before any HTTP request;
- `readonly: false` allowing the selected write client;
- mixed read-only and write-enabled environments;
- invalid JSON and each trust-boundary validation category;
- errors that do not contain configured token values;
- duplicate named and legacy entries;
- unchanged legacy single-token and two-token behavior;
- unchanged global `BILLFORWARD_READ_ONLY` semantics for old configuration;
- the MCP schema accepting names such as `dev`, `staging`, and `qa-2`;
- a real registered write handler enforcing the selected environment;
- help output showing names and modes without secrets;
- the existing unit suite, protocol test, TypeScript build, and clean diff.

## Documentation and release boundary

The README will document the new catalog, its JSON encoding inside MCP config,
the safe `readonly` default, optional `baseUrl`, coexistence rules, and the
unchanged legacy variables.

The implementation may prepare a version bump, commit, and tests as separately
authorized work. It must not run `npm publish`; publication remains the user's
responsibility.

## Non-goals

- Renaming or removing current environment variables.
- Automatically migrating existing MCP configurations.
- Inferring names such as `dev`, `staging`, or `prod`.
- Per-tool or per-operation permission policies beyond read-only versus write.
- Changing Billforward authentication away from `access_token`.
- Testing write operations against a live Billforward environment.
