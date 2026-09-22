import { AUTH_TOKEN, expect, test, uniqueUser } from './support/users';

/**
 * The OpenAPI specification publishes `/dev` and `/prod` as separate servers with
 * identical behavior. These tests assert that the two environments keep separate
 * state, so data created through one prefix never leaks into the other.
 */
test.describe('Environment isolation', () => {
  test('a user created in the current environment is not listed in the other one', async ({
    users,
    otherEnvironmentUsers,
  }) => {
    const user = uniqueUser();

    try {
      const created = await users.create(user);
      expect(created.status()).toBe(201);

      expect(
        await users.listContains(user.email),
        `the user must exist in ${users.environmentName}`,
      ).toBe(true);
      expect(
        await otherEnvironmentUsers.listContains(user.email),
        `the user must not exist in ${otherEnvironmentUsers.environmentName}`,
      ).toBe(false);
    } finally {
      await users.cleanUp(user.email);
    }
  });

  test('the same email can hold different data in each environment', async ({
    users,
    otherEnvironmentUsers,
  }) => {
    const sharedEmail = uniqueUser().email;
    const here = uniqueUser({ email: sharedEmail, name: 'Current Environment', age: 33 });
    const there = uniqueUser({ email: sharedEmail, name: 'Other Environment', age: 44 });

    try {
      expect((await users.create(here)).status()).toBe(201);
      expect((await otherEnvironmentUsers.create(there)).status()).toBe(201);

      expect(await users.findInList(sharedEmail)).toEqual(here);
      expect(await otherEnvironmentUsers.findInList(sharedEmail)).toEqual(there);
    } finally {
      await users.cleanUp(sharedEmail);
      await otherEnvironmentUsers.cleanUp(sharedEmail);
    }
  });

  test('deleting a user in the current environment keeps it in the other one', async ({
    users,
    otherEnvironmentUsers,
  }) => {
    const user = uniqueUser();

    try {
      expect((await users.create(user)).status()).toBe(201);
      expect((await otherEnvironmentUsers.create(user)).status()).toBe(201);

      const deleted = await users.delete(user.email, { token: AUTH_TOKEN });
      expect(deleted.status()).toBe(204);

      expect(await users.listContains(user.email)).toBe(false);
      expect(
        await otherEnvironmentUsers.listContains(user.email),
        `${otherEnvironmentUsers.environmentName} must keep its own copy of the user`,
      ).toBe(true);
    } finally {
      await users.cleanUp(user.email);
      await otherEnvironmentUsers.cleanUp(user.email);
    }
  });
});
