import {
  AUTH_TOKEN,
  INVALID_AUTH_TOKEN,
  MAXIMUM_AGE,
  MINIMUM_AGE,
  expect,
  expectErrorSchema,
  expectUserListSchema,
  expectUserSchema,
  test,
  uniqueUser,
  unknownEmail,
} from './support/users';

test.describe('GET /users', () => {
  test('returns 200 and a JSON array matching the User schema', async ({ users }) => {
    const response = await users.list();

    expect(response.status()).toBe(200);
    expectUserListSchema(await response.json());
  });

  test('lists a user that was just created', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.list();
      expect(response.status()).toBe(200);

      const body = (await response.json()) as Array<Record<string, unknown>>;
      expectUserListSchema(body);
      expect(body).toContainEqual(user);
    } finally {
      await users.cleanUp(user.email);
    }
  });
});

test.describe('POST /users', () => {
  test('creates a user and returns 201 with the created resource', async ({ users }) => {
    const user = uniqueUser();

    try {
      const response = await users.create(user);

      expect(response.status()).toBe(201);
      const body = await response.json();
      expectUserSchema(body);
      expect(body).toEqual(user);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 400 when name is missing', async ({ users }) => {
    const { email, age } = uniqueUser();

    const response = await users.create({ email, age });

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 400 when email is missing', async ({ users }) => {
    const { name, age } = uniqueUser();

    const response = await users.create({ name, age });

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 400 when age is missing', async ({ users }) => {
    const { name, email } = uniqueUser();

    const response = await users.create({ name, email });

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 400 when the request body carries no fields', async ({ users }) => {
    const response = await users.create({});

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 400 when age is below the documented minimum', async ({ users }) => {
    const user = uniqueUser({ age: MINIMUM_AGE - 1 });

    const response = await users.create(user);

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 400 when age is not an integer', async ({ users }) => {
    const { name, email } = uniqueUser();

    const response = await users.create({ name, email, age: 'thirty' });

    expect(response.status()).toBe(400);
    expectErrorSchema(await response.json());
  });

  test('returns 201 when age is exactly the documented minimum', async ({ users }) => {
    const user = uniqueUser({ age: MINIMUM_AGE });

    try {
      const response = await users.create(user);

      expect(response.status()).toBe(201);
      const body = await response.json();
      expectUserSchema(body);
      expect(body).toEqual(user);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 201 when age is exactly the documented maximum', async ({ users }) => {
    const user = uniqueUser({ age: MAXIMUM_AGE });

    try {
      const response = await users.create(user);

      expect(response.status()).toBe(201);
      const body = await response.json();
      expectUserSchema(body);
      expect(body).toEqual(user);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 409 when the email already exists', async ({ users }) => {
    const user = uniqueUser();

    try {
      const created = await users.create(user);
      expect(created.status()).toBe(201);

      const duplicate = await users.create({ ...user, name: 'Duplicate Email User' });

      expect(duplicate.status()).toBe(409);
      expectErrorSchema(await duplicate.json());
    } finally {
      await users.cleanUp(user.email);
    }
  });
});

test.describe('GET /users/{email}', () => {
  test('returns 200 with the requested user', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.getByEmail(user.email);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expectUserSchema(body);
      expect(body).toEqual(user);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 404 and an error payload for an unknown email', async ({ users }) => {
    const response = await users.getByEmail(unknownEmail());

    expect(response.status()).toBe(404);
    expectErrorSchema(await response.json());
  });
});

test.describe('PUT /users/{email}', () => {
  test('returns 200 with the updated user', async ({ users }) => {
    const user = uniqueUser();
    const updated = { ...user, name: 'Updated Name', age: 41 };

    try {
      await users.create(user);

      const response = await users.update(user.email, updated);

      expect(response.status()).toBe(200);
      const body = await response.json();
      expectUserSchema(body);
      expect(body).toEqual(updated);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('persists the update so a later read returns the new values', async ({ users }) => {
    const user = uniqueUser();
    const updated = { ...user, name: 'Persisted Name', age: 42 };

    try {
      await users.create(user);

      const update = await users.update(user.email, updated);
      expect(update.status()).toBe(200);

      const read = await users.getByEmail(user.email);
      expect(read.status()).toBe(200);
      expect(await read.json()).toEqual(updated);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 400 when age is missing', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.update(user.email, { name: user.name, email: user.email });

      expect(response.status()).toBe(400);
      expectErrorSchema(await response.json());
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 400 when age is above the documented maximum', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.update(user.email, { ...user, age: MAXIMUM_AGE + 1 });

      expect(response.status()).toBe(400);
      expectErrorSchema(await response.json());
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 404 for an unknown email', async ({ users }) => {
    const missing = unknownEmail();

    const response = await users.update(missing, uniqueUser({ email: missing }));

    expect(response.status()).toBe(404);
    expectErrorSchema(await response.json());
  });

  test('returns 409 when the new email already belongs to another user', async ({ users }) => {
    const existing = uniqueUser();
    const target = uniqueUser();

    try {
      await users.create(existing);
      await users.create(target);

      const response = await users.update(target.email, { ...target, email: existing.email });

      expect(response.status()).toBe(409);
      expectErrorSchema(await response.json());
    } finally {
      await users.cleanUp(existing.email, target.email);
    }
  });
});

test.describe('DELETE /users/{email}', () => {
  test('returns 204 with an empty body for an authenticated request', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.delete(user.email, { token: AUTH_TOKEN });

      expect(response.status()).toBe(204);
      expect(await response.text()).toBe('');
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('removes the user from the collection', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);
      expect(await users.listContains(user.email)).toBe(true);

      const response = await users.delete(user.email, { token: AUTH_TOKEN });
      expect(response.status()).toBe(204);

      expect(await users.listContains(user.email)).toBe(false);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 401 when the Authentication header is missing', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.delete(user.email);

      expect(response.status()).toBe(401);
      expectErrorSchema(await response.json());
      expect(
        await users.listContains(user.email),
        'a rejected delete must not remove the user',
      ).toBe(true);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 401 when the Authentication header is invalid', async ({ users }) => {
    const user = uniqueUser();

    try {
      await users.create(user);

      const response = await users.delete(user.email, { token: INVALID_AUTH_TOKEN });

      expect(response.status()).toBe(401);
      expectErrorSchema(await response.json());
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('returns 404 for an unknown email', async ({ users }) => {
    const response = await users.delete(unknownEmail(), { token: AUTH_TOKEN });

    expect(response.status()).toBe(404);
    expectErrorSchema(await response.json());
  });
});
