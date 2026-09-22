# User Management API — E2E Test Suite

[![API E2E](https://github.com/josequinterosdet/user-management-api-e2e/actions/workflows/api-e2e.yml/badge.svg)](https://github.com/josequinterosdet/user-management-api-e2e/actions/workflows/api-e2e.yml)

End-to-end API test suite for the **User Management API** SDET challenge, written with
[Playwright Test](https://playwright.dev/docs/api-testing) and TypeScript.

> The badge above reports **failing** on purpose. The suite asserts the documented
> OpenAPI contract, and the application under test violates it in four places, so the
> `dev` and `prod` jobs stay red until those defects are fixed. See [`BUGS.md`](./BUGS.md).

A single suite runs unchanged against both documented environments, `dev` and `prod`, and
validates the application against the authoritative OpenAPI specification in
[`sdet_challenge_api.yml`](./sdet_challenge_api.yml).

## Highlights

- **Pure API testing.** Every request goes through Playwright's `APIRequestContext`. No
  browser is ever launched and no browser binaries are required.
- **One suite, two environments.** The environment prefix is a custom Playwright option,
  so the Playwright projects `dev` and `prod` execute the exact same specs.
- **Contract-driven assertions.** Status codes, response schemas and error payloads are
  asserted against the OpenAPI specification, never against observed behavior.
- **Schema validation without extra dependencies.** Response shapes are verified with
  native Playwright matchers only, with no external schema library.
- **Independent, parallel-safe tests.** Every test builds its own UUID-based user and
  cleans up in a `finally` block using an authenticated `DELETE`.
- **No fixed sleeps.** Readiness is handled by bounded polling in the pipeline; the tests
  themselves contain no waits.

## Requirements

- Node.js 20 or newer (validated on 22.14.0).
- Docker, running, to host the application under test.

## Getting started

Install dependencies:

```bash
npm ci
```

Start the application under test:

```bash
docker run --detach --name user-management-api --publish 3000:3000 \
  ghcr.io/danielsilva-loanpro/sdet-interview-challenge:c08f5d2302641206704023d0c36af6b89ff85724
```

Confirm both environments answer with a JSON array:

```bash
curl --fail http://localhost:3000/dev/users
curl --fail http://localhost:3000/prod/users
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check the suite without emitting output |
| `npm run test:list` | List every discovered test (56 total) |
| `npm run test:dev` | Run the suite against the `dev` environment |
| `npm run test:prod` | Run the suite against the `prod` environment |
| `npm test` | Run both environments |
| `npm run report` | Open the generated HTML report |

The base URL defaults to `http://127.0.0.1:3000` and can be overridden with the
`API_BASE_URL` environment variable.

When you are done, remove the container:

```bash
docker rm --force user-management-api
```

## Project layout

```text
.
├── .github/workflows/api-e2e.yml   # Parallel dev and prod pipeline
├── tests/
│   ├── support/users.ts            # API client, fixtures, data builders, schema assertions
│   ├── users.spec.ts               # CRUD, validation and authentication coverage
│   └── environment-isolation.spec.ts
├── playwright.config.ts            # dev and prod projects, HTML reporter
├── sdet_challenge_api.yml          # Authoritative OpenAPI specification
├── BUGS.md                         # Confirmed specification violations
└── playwright-report/              # Generated HTML report (committed deliverable)
```

## Coverage

56 tests in total: the same 28 scenarios executed by the `dev` project and by the `prod`
project.

| Operation | Asserted responses | Scenarios per environment |
| --- | --- | --- |
| `GET /{env}/users` | `200` | 2 |
| `POST /{env}/users` | `201`, `400`, `409` | 10 |
| `GET /{env}/users/{email}` | `200`, `404` | 2 |
| `PUT /{env}/users/{email}` | `200`, `400`, `404`, `409` | 6 |
| `DELETE /{env}/users/{email}` | `204`, `401`, `404` | 5 |
| Environment isolation | — | 3 |

Every endpoint, HTTP method and documented status code in the specification is covered.

**Age boundaries** are covered without redundant combinations: `POST` asserts the
rejected value below the minimum (`0`) plus both accepted boundaries (`1` and `150`),
and `PUT` asserts the rejected value above the maximum (`151`).

**`DELETE` authentication** is covered for a valid token, a missing header and an invalid
token.

**Environment isolation** asserts that a user created in one environment is absent from
the other, that the same email can hold different data in each environment, and that
deleting in one environment leaves the other untouched.

## Design decisions

**The environment prefix is a Playwright option, not part of `baseURL`.** Two reasons.
First, `APIRequestContext` resolves relative URLs with `new URL()` semantics, so a
`baseURL` of `http://127.0.0.1:3000/dev` combined with a path of `/users` would silently
drop the `/dev` prefix. Second, the isolation specs must reach both environments inside a
single test, which is impossible when the prefix is fixed in `baseURL`. The suite
therefore uses the host as `baseURL` and derives the prefix from the project, exposing a
`users` fixture for the current environment and an `otherEnvironmentUsers` fixture for
the opposite one.

**Schema assertions use native matchers.** `expectUserSchema` asserts the exact documented
key set with `toEqual` plus asymmetric matchers, and additionally asserts that `age` is an
integer. `expectErrorSchema` uses `objectContaining`, because `ErrorResponse` requires
`error` but does not forbid additional properties. This keeps contract validation strict
without pulling in a schema library.

**Test data is unique and tests are independent.** Each test generates its own
`sdet-<uuid>@example.com` address, so the suite is safe to run fully parallel against a
shared database and no test depends on another's state or on execution order.

**Cleanup always runs authenticated.** Teardown lives in a `finally` block and always
sends the `Authentication` header, so it works in `prod`, where anonymous deletes are
correctly rejected. The helper tolerates already-removed users, so cleanup never fails a
test.

**The `DELETE` token comes from the challenge brief.** The specification declares the
`Authentication` header as required but does not publish its value. The brief states that
`mysecrettoken` is valid for both `dev` and `prod`.

**Failing tests are left failing.** The suite contains no `continue-on-error`, no retries,
no skips and no weakened assertions. Tests that expose a specification violation stay red
on purpose; see [`BUGS.md`](./BUGS.md).

## Reporting

There is always exactly **one** report, titled **User Management API E2E Test Report** and
written by the native Playwright HTML reporter to `playwright-report/`. Every result
carries a colored badge with its `dev` or `prod` project, failures show the expected and
actual values next to the failing assertion, and each test lists the HTTP calls it made,
including the cleanup `DELETE`.

```bash
npm run report
```

### Locally: the report mirrors the command you ran

Playwright replaces `playwright-report/` on every run, so the report always describes the
last execution and nothing else.

| Command | Report contents |
| --- | --- |
| `npm run test:dev` | 28 tests, only `dev` badges |
| `npm run test:prod` | 28 tests, only `prod` badges |
| `npm test` | 56 tests, both environments side by side |

Inside the report, `p:dev` or `p:prod` in the search box filters a combined report down to
a single environment, and clicking a badge does the same.

### In CI: two isolated runs, one merged report

The environments must execute on separate runners to stay isolated, yet the deliverable is
a single report. Those two goals are reconciled with Playwright's blob format:

1. Each environment job runs with `--reporter=blob,list`, producing an intermediate
   `report-dev.zip` or `report-prod.zip` plus readable job logs.
2. A `merged-report` job downloads both blobs and runs `playwright merge-reports`,
   rebuilding one HTML report that contains all 56 results with their project badges.

The outcome is a single artifact, **`api-report`**, holding both environments. The
per-environment blobs are also uploaded with a one-day retention as debugging material.

This is preferred over publishing two separate HTML reports because the reviewer opens one
artifact instead of two identically titled ones, and the `dev` versus `prod` comparison
happens in a single view.

## Continuous integration

[`.github/workflows/api-e2e.yml`](./.github/workflows/api-e2e.yml) defines a matrix over
`[dev, prod]`, producing the jobs **API E2E - dev** and **API E2E - prod**, followed by a
**Merged API E2E report** job.

- Each environment job runs on its own `ubuntu-latest` runner and starts its own container,
  so the environments never share state.
- `fail-fast: false` guarantees that a failure in one environment never cancels the other,
  which is required because known product bugs keep some tests red.
- Readiness uses a bounded polling loop, capped at 60 attempts, instead of a fixed sleep.
- Container logs are printed when a job fails, and every upload uses `if: always()`.
- The merge job is guarded by `if: always()`, so the report is still produced while the
  environment jobs are red. Those jobs keep carrying the failure signal: the merge job
  reports only whether the report could be built.

## Known bugs

Local validation confirmed four specification violations, documented with full evidence
in [`BUGS.md`](./BUGS.md):

| ID | Summary | Environment |
| --- | --- | --- |
| [BUG-001](./BUGS.md#bug-001-duplicate-email-returns-500-instead-of-409) | Duplicate email returns `500` instead of `409` | `dev`, `prod` |
| [BUG-002](./BUGS.md#bug-002-reading-an-unknown-user-returns-500-instead-of-404) | Reading an unknown user returns `500` instead of `404` | `dev`, `prod` |
| [BUG-003](./BUGS.md#bug-003-a-successful-update-is-never-persisted) | A successful `PUT` is never persisted | `dev`, `prod` |
| [BUG-004](./BUGS.md#bug-004-dev-deletes-users-without-any-authentication) | `dev` deletes users without any authentication | `dev` |

Latest local run: **56 tests, 48 passed, 8 failed**, with all 8 failures attributable to
those four bugs.
