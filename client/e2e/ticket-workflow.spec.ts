import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('customer and support agent complete a ticket lifecycle', async ({ page }) => {
  const agentEmail = process.env.LOCAL_AGENT_EMAIL;
  const agentPassword = process.env.LOCAL_AGENT_PASSWORD;
  if (!agentEmail || !agentPassword) {
    throw new Error('Set LOCAL_AGENT_EMAIL and LOCAL_AGENT_PASSWORD in the root .env file.');
  }

  const customerEmail = `customer-${randomUUID()}@example.test`;
  const customerPassword = 'Customer-Test-123!';
  const ticketTitle = `E2E ticket ${randomUUID()}`;
  const agentReply = `Agent response ${randomUUID()}`;

  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Customer');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(customerPassword);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('link', { name: 'New Ticket' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'My Tickets' })).toBeVisible();
  await page.getByRole('link', { name: 'New Ticket' }).click();
  await page.getByLabel('Title').fill(ticketTitle);
  await page.getByLabel('Description').fill('Created by the local browser end-to-end test.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();

  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/i);
  const ticketId = page.url().split('/').at(-1)!;
  await expect(page.getByRole('heading', { name: ticketTitle })).toBeVisible();
  const customerTicketsResponse = await page.request.get('/api/tickets/mine');
  expect(customerTicketsResponse.status()).toBe(200);
  expect((await customerTicketsResponse.json()).some((ticket: { id: string }) => ticket.id === ticketId)).toBe(true);
  await page.getByRole('button', { name: 'Logout' }).click();

  await page.getByLabel('Email').fill(agentEmail);
  await page.getByLabel('Password').fill(agentPassword);
  const agentLoginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await agentLoginResponse).status()).toBe(200);
  await expect(page.getByText('Signed in as SupportAgent')).toBeVisible();
  const agentTicketsResponse = await page.request.get('/api/tickets');
  expect(agentTicketsResponse.status()).toBe(200);
  const agentTickets = await agentTicketsResponse.json();
  expect(agentTickets.some((ticket: { id: string }) => ticket.id === ticketId)).toBe(true);

  await page.goto('/dashboard');
  const closedCount = page.locator('.tile').filter({ hasText: 'Closed' }).locator('.value');
  await expect(closedCount).toBeVisible();
  const closedBefore = Number(await closedCount.textContent());

  await page.goto('/agent/queue');
  const ticketRow = page.getByRole('row').filter({ hasText: ticketTitle });
  await expect(ticketRow).toBeVisible();
  await ticketRow.getByRole('link', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Assign to me' }).click();

  const responseProjectionUrl = new URL(`/api/responses/ticket/${ticketId}`, page.url()).toString();
  await expect
    .poll(async () => (await page.context().request.get(responseProjectionUrl)).status(), { timeout: 30_000 })
    .toBe(200);

  await page.getByLabel('Write a reply').fill(agentReply);
  const createResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/responses') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const createdResponse = await createResponse.json();
  expect(createdResponse.authorRole).toBe('SupportAgent');
  await expect(page.getByText(agentReply)).toBeVisible();

  const ticketMetricUrl = `/api/metrics/tickets/${ticketId}`;
  await expect
    .poll(async () => {
      const response = await page.request.get(ticketMetricUrl);
      if (!response.ok()) {
        return false;
      }
      const metric = await response.json();
      return metric.status === 'InProgress' && metric.firstResponseAtUtc !== null;
    }, { timeout: 30_000 })
    .toBe(true);

  await page.getByLabel('Status').selectOption('Closed');
  await page.getByRole('button', { name: 'Close ticket' }).click();
  await expect(page.locator('.summary-card app-status-chip').getByText('Closed')).toBeVisible();

  await expect
    .poll(async () => {
      const response = await page.request.get(ticketMetricUrl);
      if (!response.ok()) {
        return false;
      }
      const metric = await response.json();
      return metric.status === 'Closed' && metric.closedAtUtc !== null;
    }, { timeout: 30_000 })
    .toBe(true);

  await page.goto('/dashboard');
  await expect
    .poll(async () => {
      await page.reload();
      return Number(await closedCount.textContent());
    }, { timeout: 30_000 })
    .toBe(closedBefore + 1);

  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(customerPassword);
  const customerLoginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await customerLoginResponse).status()).toBe(200);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

  const notificationForTicket = page.locator('.list-group-item').filter({ has: page.locator(`a[href="/tickets/${ticketId}"]`) });
  const expectedNotifications = [
    'A support agent replied to your ticket.',
    'Your ticket status changed to InProgress.',
    'Your ticket status changed to Closed.',
  ];
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/notifications/mine');
      expect(response.status()).toBe(200);
      const notifications = await response.json();
      const ticketNotifications = notifications.filter((notification: { ticketId: string }) => notification.ticketId === ticketId);
      return expectedNotifications.every((message) => ticketNotifications.some((notification: { message: string }) => notification.message === message));
    }, { timeout: 30_000 })
    .toBe(true);

  await page.reload();
  await expect(notificationForTicket).toHaveCount(3, { timeout: 15_000 });
  await notificationForTicket.first().getByRole('link', { name: 'View ticket' }).click();
  await expect(page.getByText(agentReply)).toBeVisible();
  await expect(page.locator('.summary-card app-status-chip').getByText('Closed')).toBeVisible();
});