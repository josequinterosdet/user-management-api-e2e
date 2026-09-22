import { test as base, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Environments published by the OpenAPI specification as server prefixes.
 */
export type EnvironmentName = 'dev' | 'prod';

/**
 * Custom Playwright option used to bind a project to one API environment,
 * so that a single suite runs unchanged against `dev` and `prod`.
 */
export type ApiTestOptions = {
  environmentName: EnvironmentName;
};

/**
 * `User` schema as defined by the OpenAPI specification.
 */
export type User = {
  name: string;
  email: string;
  age: number;
};

/**
 * Token accepted by the API in the `Authentication` header of a DELETE request.
 *
 * The OpenAPI specification declares the header as required but does not publish
 * its value. The candidate brief states that the same token is valid for `dev`
 * and `prod`.
 */
export const AUTH_TOKEN = 'mysecrettoken';

export const INVALID_AUTH_TOKEN = 'invalid-authentication-token';

/**
 * Age boundaries declared by the OpenAPI specification (`minimum` and `maximum`).
 */
export const MINIMUM_AGE = 1;
export const MAXIMUM_AGE = 150;

/**
 * Thin client over `APIRequestContext` that targets one environment prefix.
 */
export class UsersClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly environmentName: EnvironmentName,
  ) {}

  private path(suffix = ''): string {
    return `/${this.environmentName}/users${suffix}`;
  }

  private userPath(email: string): string {
    return this.path(`/${encodeURIComponent(email)}`);
  }

  list(): Promise<APIResponse> {
    return this.request.get(this.path());
  }

  create(payload: unknown): Promise<APIResponse> {
    return this.request.post(this.path(), { data: payload });
  }

  getByEmail(email: string): Promise<APIResponse> {
    return this.request.get(this.userPath(email));
  }

  update(email: string, payload: unknown): Promise<APIResponse> {
    return this.request.put(this.userPath(email), { data: payload });
  }

  /**
   * Sends a DELETE request. Omitting `token` sends no `Authentication` header at all.
   */
  delete(email: string, options: { token?: string } = {}): Promise<APIResponse> {
    return this.request.delete(this.userPath(email), {
      headers: options.token === undefined ? undefined : { Authentication: options.token },
    });
  }

  async readUsers(): Promise<User[]> {
    const response = await this.list();
    return (await response.json()) as User[];
  }

  async listContains(email: string): Promise<boolean> {
    const users = await this.readUsers();
    return users.some((user) => user.email === email);
  }

  async findInList(email: string): Promise<User | undefined> {
    const users = await this.readUsers();
    return users.find((user) => user.email === email);
  }

  /**
   * Authenticated cleanup. Safe to call for users that were never created or
   * were already removed, so it can always run from a `finally` block.
   */
  async cleanUp(...emails: string[]): Promise<void> {
    for (const email of emails) {
      await this.delete(email, { token: AUTH_TOKEN });
    }
  }
}

/**
 * Builds a user payload with a collision-free email so tests stay independent
 * and can run in parallel against a shared environment.
 */
export function uniqueUser(overrides: Partial<User> = {}): User {
  return {
    name: 'SDET Test User',
    email: `sdet-${randomUUID()}@example.com`,
    age: 30,
    ...overrides,
  };
}

/**
 * Builds an email that is guaranteed not to exist in any environment.
 */
export function unknownEmail(): string {
  return `sdet-unknown-${randomUUID()}@example.com`;
}

/**
 * Asserts the `User` schema: exactly `name`, `email` and `age`, with `age` an integer.
 */
export function expectUserSchema(body: unknown): void {
  expect(body, 'response body must match the User schema').toEqual({
    name: expect.any(String),
    email: expect.any(String),
    age: expect.any(Number),
  });
  expect(Number.isInteger((body as User).age), 'age must be an integer').toBe(true);
}

export function expectUserListSchema(body: unknown): void {
  expect(Array.isArray(body), 'response body must be a JSON array').toBe(true);
  for (const item of body as unknown[]) {
    expectUserSchema(item);
  }
}

/**
 * Asserts the `ErrorResponse` schema. It matches loosely on purpose: the
 * specification requires `error` but does not forbid additional properties.
 */
export function expectErrorSchema(body: unknown): void {
  expect(body, 'response body must match the ErrorResponse schema').toEqual(
    expect.objectContaining({ error: expect.any(String) }),
  );
}

type ApiFixtures = {
  /** Client bound to the environment of the current Playwright project. */
  users: UsersClient;
  /** Client bound to the opposite environment, used by isolation coverage. */
  otherEnvironmentUsers: UsersClient;
};

export const test = base.extend<ApiTestOptions & ApiFixtures>({
  environmentName: ['dev', { option: true }],

  users: async ({ request, environmentName }, use) => {
    await use(new UsersClient(request, environmentName));
  },

  otherEnvironmentUsers: async ({ request, environmentName }, use) => {
    await use(new UsersClient(request, environmentName === 'dev' ? 'prod' : 'dev'));
  },
});

export { expect };
