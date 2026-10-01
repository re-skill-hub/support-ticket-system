import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('admin creates a user, changes their role, deactivates them, and blocks their login', async ({ page }) => {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD in the root .env file.');
  }

  const newUserEmail = `e2e-user-${randomUUID()}@example.test`;
  const newUserPassword = 'New-User-Test-123!';

  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  const adminLoginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await adminLoginResponse).status()).toBe(200);

  await page.getByRole('link', { name: 'Manage Users' }).first().click();
  await expect(page.getByRole('heading', { name: 'Manage Users' })).toBeVisible();

  await page.getByRole('button', { name: 'New user' }).click();
  await page.getByLabel('Email').fill(newUserEmail);
  await page.getByLabel('Password').fill(newUserPassword);
  await page.getByLabel('Full name').fill('E2E Managed User');
  // Exact match: without it, this substring-matches "Role filter" and every row's "Change role"
  // select too (8 elements total) now that the admin user-list page has grown those controls.
  await page.getByLabel('Role', { exact: true }).selectOption('Customer');
  const createUserResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/users') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create user' }).click();
  expect((await createUserResponse).status()).toBe(201);

  const userRow = page.getByRole('row').filter({ hasText: newUserEmail });
  await expect(userRow).toBeVisible();
  await expect(userRow.getByRole('combobox', { name: 'Change role' })).toHaveValue('Customer');

  const changeRoleResponse = page.waitForResponse(
    (response) => /\/api\/users\/[^/]+\/role$/.test(response.url()) && response.request().method() === 'PUT',
  );
  await userRow.getByRole('combobox', { name: 'Change role' }).selectOption('SupportAgent');
  expect((await changeRoleResponse).status()).toBe(200);
  await expect(userRow.getByRole('combobox', { name: 'Change role' })).toHaveValue('SupportAgent');

  await expect(userRow.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  const setStatusResponse = page.waitForResponse(
    (response) => /\/api\/users\/[^/]+\/status$/.test(response.url()) && response.request().method() === 'PATCH',
  );
  await userRow.getByRole('button', { name: 'Deactivate' }).click();
  expect((await setStatusResponse).status()).toBe(200);
  await expect(userRow.getByText('Deactivated')).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(newUserEmail);
  await page.getByLabel('Password').fill(newUserPassword);
  const blockedLoginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await blockedLoginResponse).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/);
});
