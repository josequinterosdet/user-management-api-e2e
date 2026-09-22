# Bug Report — User Management API v1.0

Four confirmed discrepancies between the behavior of the running application and the
authoritative OpenAPI specification, [`sdet_challenge_api.yml`](./sdet_challenge_api.yml).

## Summary

| ID | Bug | Severity | Affects | Endpoint |
| --- | --- | --- | --- | --- |
| [BUG-001](#bug-001-duplicate-email-returns-500-instead-of-409) | Duplicate email returns `500` instead of `409` | High | `dev` and `prod` | `POST /{env}/users` |
| [BUG-002](#bug-002-reading-an-unknown-user-returns-500-instead-of-404) | Reading an unknown user returns `500` instead of `404` | High | `dev` and `prod` | `GET /{env}/users/{email}` |
| [BUG-003](#bug-003-a-successful-update-is-never-persisted) | A successful update is never persisted | Critical | `dev` and `prod` | `PUT /{env}/users/{email}` |
| [BUG-004](#bug-004-dev-deletes-users-without-any-authentication) | `dev` deletes users without any authentication | Critical | `dev` only | `DELETE /{env}/users/{email}` |

## Validation status

Local validation is complete. Every bug was reproduced directly against the challenge
container and is deterministic: each one was observed on at least three consecutive
attempts with independent test data, and again through the automated suite.

| Item | Value |
| --- | --- |
| Image | `ghcr.io/danielsilva-loanpro/sdet-interview-challenge:c08f5d2302641206704023d0c36af6b89ff85724` |
| Base URL | `http://127.0.0.1:3000` |
| Full suite | 56 tests: 48 passed, 8 failed |
| `dev` | 28 tests: 23 passed, 5 failed |
| `prod` | 28 tests: 25 passed, 3 failed |

All 8 failures map to the 4 bugs below. None was caused by the automation, the test data
or the environment, and every failing test is kept active and unskipped.

Each bug was found and reproduced strictly through the public HTTP interface. The
**Root cause** line in each entry comes from inspecting the compiled Flask application
shipped inside the image, and is offered only as supporting evidence that these are real
implementation defects rather than differences of interpretation.

---

## BUG-001: Duplicate email returns 500 instead of 409

| | |
| --- | --- |
| **Endpoint** | `POST /{env}/users` |
| **Affects** | `dev` and `prod` |
| **Severity** | High |
| **Expected** | `409` with an `ErrorResponse` body, documented as `Duplicate email` |
| **Actual** | `500` with `{"error": "Internal server error"}` |
| **Test** | `POST /users › returns 409 when the email already exists` |

The duplicate condition is never reported as a client error, so a caller cannot tell an
already-registered email apart from a server outage, and cannot recover by choosing a
different address. Creating the first user returns `201` normally, so only the conflict
path is broken.

**Root cause.** `update_user` contains an `Email already exists` branch; `create_user`
has none and issues the raw `INSERT`, so the uniqueness violation escapes to the generic
error handler.

<details>
<summary>Reproduce</summary>

```bash
curl -i -X POST http://localhost:3000/dev/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"SDET Test User","email":"duplicate@example.com","age":30}'
# HTTP/1.1 201 CREATED

curl -i -X POST http://localhost:3000/dev/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Duplicate Email User","email":"duplicate@example.com","age":30}'
# HTTP/1.1 500 INTERNAL SERVER ERROR
# {"error": "Internal server error"}
```

</details>

<details>
<summary>Test evidence</summary>

```text
[dev]  tests/users.spec.ts:139  POST /users › returns 409 when the email already exists
[prod] tests/users.spec.ts:139  POST /users › returns 409 when the email already exists

Error: expect(received).toBe(expected) // Object.is equality
Expected: 409
Received: 500
  > 148 |       expect(duplicate.status()).toBe(409);
```

</details>

---

## BUG-002: Reading an unknown user returns 500 instead of 404

| | |
| --- | --- |
| **Endpoint** | `GET /{env}/users/{email}` |
| **Affects** | `dev` and `prod` |
| **Severity** | High |
| **Expected** | `404` with an `ErrorResponse` body, documented as `User not found` |
| **Actual** | `500` with `{"error": "Internal server error"}` |
| **Test** | `GET /users/{email} › returns 404 and an error payload for an unknown email` |

The API is inconsistent with itself: `PUT` and `DELETE` on the very same path, with the
very same unknown email, both answer a correct `404` with `{"error": "User not found"}`.
Only the read operation fails, which rules out any doubt about how the API is expected to
report a missing user.

**Root cause.** `update_user` and `delete_user` both contain the `User not found`
literal; `get_user` does not. The missing-row branch was never implemented for the read
operation, so a `None` row reaches the serializer and raises.

<details>
<summary>Reproduce</summary>

```bash
curl -i http://localhost:3000/dev/users/missing-user@example.com
# HTTP/1.1 500 INTERNAL SERVER ERROR
# {"error": "Internal server error"}

# Same unknown email, other verbs, correct behavior:
curl -i -X DELETE http://localhost:3000/dev/users/missing-user@example.com \
  -H 'Authentication: mysecrettoken'
# HTTP/1.1 404 NOT FOUND
# {"error": "User not found"}
```

</details>

<details>
<summary>Test evidence</summary>

```text
[dev]  tests/users.spec.ts:174  GET /users/{email} › returns 404 and an error payload for an unknown email
[prod] tests/users.spec.ts:174  GET /users/{email} › returns 404 and an error payload for an unknown email

Error: expect(received).toBe(expected) // Object.is equality
Expected: 404
Received: 500
  > 177 |     expect(response.status()).toBe(404);
```

</details>

---

## BUG-003: A successful update is never persisted

| | |
| --- | --- |
| **Endpoint** | `PUT /{env}/users/{email}` |
| **Affects** | `dev` and `prod` |
| **Severity** | Critical |
| **Expected** | `200: User updated successfully`, and any later read returns the new values |
| **Actual** | `200` echoing the new values, while the stored user keeps the old ones |
| **Test** | `PUT /users/{email} › persists the update so a later read returns the new values` |

This is the most damaging defect found. The response reports a state the server never
reached, so a client has no way to detect the data loss from the response alone. Both a
later `GET /{env}/users/{email}` and the `GET /{env}/users` collection still return the
original values.

Validation and conflict detection on the same endpoint work correctly, returning `400`
for invalid fields, `404` for unknown users and `409` for a duplicate email. The request
is therefore processed in full and only the write is lost.

**Root cause.** `create_user` and `delete_user` both call `commit`. `update_user` runs
its `UPDATE` statement but is the only mutating handler that never commits, so the
transaction is discarded when the connection closes. This confirms a lost write rather
than a caching or read-consistency artifact.

<details>
<summary>Reproduce</summary>

```bash
curl -i -X POST http://localhost:3000/dev/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Before","email":"persist@example.com","age":30}'

curl -i -X PUT http://localhost:3000/dev/users/persist@example.com \
  -H 'Content-Type: application/json' \
  -d '{"name":"Persisted Name","email":"persist@example.com","age":42}'
# HTTP/1.1 200 OK
# {"age": 42, "email": "persist@example.com", "name": "Persisted Name"}

curl -i http://localhost:3000/dev/users/persist@example.com
# HTTP/1.1 200 OK
# {"age": 30, "email": "persist@example.com", "name": "Before"}   <-- unchanged
```

</details>

<details>
<summary>Test evidence</summary>

```text
[dev]  tests/users.spec.ts:201  PUT /users/{email} › persists the update so a later read returns the new values
[prod] tests/users.spec.ts:201  PUT /users/{email} › persists the update so a later read returns the new values

Error: expect(received).toEqual(expected) // deep equality
- Expected  - 2
+ Received  + 2

  Object {
-   "age": 42,
+   "age": 30,
    "email": "sdet-fb2320ce-e8ce-4952-a3b2-e04205d9bda5@example.com",
-   "name": "Persisted Name",
+   "name": "SDET Test User",
  }

  > 213 |       expect(await read.json()).toEqual(updated);
```

</details>

---

## BUG-004: dev deletes users without any authentication

| | |
| --- | --- |
| **Endpoint** | `DELETE /{env}/users/{email}` |
| **Affects** | `dev` only, `prod` is correct |
| **Severity** | Critical (security) |
| **Expected** | `401` for a missing or invalid token, and the user must survive |
| **Actual** | `204` and the user is permanently deleted |
| **Tests** | `DELETE /users/{email} › returns 401 when the Authentication header is missing`<br>`DELETE /users/{email} › returns 401 when the Authentication header is invalid` |

The specification declares the `Authentication` header as `required: true` and documents
`401` for `Authentication required or invalid`. The candidate brief states that
`mysecrettoken` is the valid token for **both** environments.

In `dev` the header is ignored entirely, so the documented `401` is unreachable and any
unauthenticated caller can destroy data. `prod` implements the same operation correctly.
The specification is therefore honored in only one of the two documented environments.

Each row below used a freshly created user:

| `Authentication` header | `dev` status | Deleted in `dev`? | `prod` status | Deleted in `prod`? |
| --- | --- | --- | --- | --- |
| absent | `204` | yes | `401` | no |
| empty string | `204` | yes | `401` | no |
| `invalid-authentication-token` | `204` | yes | `401` | no |
| `mysecrettoken` | `204` | yes | `204` | yes |

**Root cause.** `delete_user` is the only handler carrying a bare `dev` environment
literal, evaluated next to `Authentication` and `AUTH_TOKEN`. The authentication guard is
short-circuited for that one environment, which points to a deliberate branch rather than
a configuration difference between deployments.

<details>
<summary>Reproduce</summary>

```bash
curl -i -X POST http://localhost:3000/dev/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Unauthenticated Delete","email":"noauth@example.com","age":30}'

curl -i -X DELETE http://localhost:3000/dev/users/noauth@example.com
# HTTP/1.1 204 NO CONTENT        <-- no Authentication header was sent

curl -i http://localhost:3000/dev/users
# the user is gone

# The same request against prod is correctly rejected:
curl -i -X DELETE http://localhost:3000/prod/users/noauth@example.com
# HTTP/1.1 401 UNAUTHORIZED
# {"error": "Authentication required"}
```

</details>

<details>
<summary>Test evidence</summary>

```text
[dev] tests/users.spec.ts:308  DELETE /users/{email} › returns 401 when the Authentication header is missing
Error: expect(received).toBe(expected) // Object.is equality
Expected: 401
Received: 204
  > 316 |       expect(response.status()).toBe(401);

[dev] tests/users.spec.ts:327  DELETE /users/{email} › returns 401 when the Authentication header is invalid
Error: expect(received).toBe(expected) // Object.is equality
Expected: 401
Received: 204
  > 335 |       expect(response.status()).toBe(401);
```

The equivalent `prod` tests pass, which isolates the defect to `dev`.

</details>

---

## Observations not reported as bugs

These behaviors were noticed during exploration but are **not** claimed as defects,
because the specification does not state the expectation unambiguously. No test asserts
them, to avoid encoding undocumented behavior.

- **`email` format is not validated.** `POST /{env}/users` accepts
  `{"name":"X","email":"not-an-email","age":30}` and returns `201`. The schema declares
  `format: email`, but in OpenAPI `format` is an annotation rather than a guaranteed
  validation constraint, and no `400` is documented for this case.
- **An undocumented endpoint exists.** The application also serves
  `POST /{env}/users/{email}/notes`, which appears nowhere in `sdet_challenge_api.yml`.
  It is out of scope for this challenge and is not exercised by the suite.
