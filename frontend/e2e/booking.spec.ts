import { expect, request, test } from '@playwright/test';

test('a member books a 50-minute session from the calendar', async ({ page }) => {
  const api = await request.newContext({ baseURL: 'http://localhost:4000' });
  const csrf = (await (await api.get('/api/auth/csrf')).json()).data.csrfToken as string;
  const stamp = Date.now();
  const professionalName = `Dr. Elena ${stamp}`;
  const registered = await api.post('/api/auth/register', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      name: professionalName,
      email: `elena-${stamp}@example.com`,
      password: 'Password123!',
      role: 'PROFESSIONAL',
      timezone: 'Asia/Singapore',
      title: 'Counsellor',
      bio: 'A calm fictional counsellor used only by the end-to-end booking test.',
      focusAreas: 'Stress',
    },
  });
  expect(registered.ok()).toBeTruthy();
  const saved = await api.put('/api/availability/me', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      windows: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '00:00',
        endTime: '23:00',
        enabled: true,
      })),
    },
  });
  expect(saved.ok()).toBeTruthy();
  await api.dispose();

  await page.goto('/register');
  await page.getByLabel('Full name').fill('Maya Ellison');
  await page.getByLabel('Email').fill(`maya-${stamp}@example.com`);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible();

  await page.getByRole('link', { name: 'Professionals', exact: true }).click();
  await page.getByPlaceholder('Search by name').fill(String(stamp));
  const card = page.getByTestId('professional-card').filter({ hasText: professionalName });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: 'View profile' }).click();
  await page.locator('[data-testid="day-button"][data-has-slots="true"]').first().click();
  await page.locator('[data-testid="slot-button"]:not([disabled])').first().click();
  await page.getByTestId('confirm-booking').click();

  const confirmation = page.getByTestId('booking-success');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(professionalName)).toBeVisible();
  await expect(confirmation.getByText('50 minutes')).toBeVisible();
  await expect(confirmation.getByText('upcoming')).toBeVisible();
});
