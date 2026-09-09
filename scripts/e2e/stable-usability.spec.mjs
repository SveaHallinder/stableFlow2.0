import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('horse name search combines with ownership filters and can be reset', async ({ page }) => {
  await page.goto('/stable-horses?qaDemo=1');
  const search = page.getByRole('textbox', { name: 'Sök häst efter namn' });
  await expect(search).toBeVisible();
  await search.fill('  sAg  ');
  await expect(page.getByText('Saga', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mina', exact: true }).click();
  await expect(page.getByText('Saga', { exact: true })).toBeVisible();
  await search.fill('Finns inte');
  await expect(page.getByText('Inga hästar matchar sökningen.', { exact: true })).toBeVisible();
  await expect(page.getByText('Saga', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lägg till häst', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rensa hästsökning' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByText('Saga', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ansvar', exact: true }).click();
  await expect(page.getByText('Saga', { exact: true })).toBeVisible();
  await search.fill('Finns inte');
  await page.getByRole('button', { name: 'Visa alla hästar' }).click();
  await expect(page.getByRole('button', { name: 'Alla', exact: true, pressed: true })).toBeVisible();
  await expect(page.getByText('Saga', { exact: true })).toBeVisible();
});

test('mobile contact details remain readable and expose phone and email links', async ({ page }) => {
  await page.goto('/contacts?qaDemo=1');
  const name = page.getByText('Anna Veterinär', { exact: true });
  const type = page.getByText('Veterinär', { exact: true });
  const phone = page.getByRole('link', { name: 'Ring Anna Veterinär: 070-111 22 33' });
  const email = page.getByRole('link', { name: 'Skicka e-post till Anna Veterinär: anna@example.com' });
  await expect(name).toBeVisible();
  await expect(type).toBeVisible();
  await expect(phone).toHaveAttribute('href', 'tel:0701112233');
  await expect(email).toHaveAttribute('href', 'mailto:anna@example.com');
  const boxes = await Promise.all([name, type, phone, email].map((item) => item.boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height);
  }
  expect(boxes[2].height).toBeGreaterThanOrEqual(44);
  expect(boxes[3].height).toBeGreaterThanOrEqual(44);
  const edit = page.getByRole('button', { name: 'Redigera Anna Veterinär' });
  await expect(edit).toBeVisible();
  expect((await edit.boundingBox()).y).toBeGreaterThanOrEqual(boxes[3].y + boxes[3].height);
  // Inspect destinations only: never open the device's phone or mail application.
  const search = page.getByRole('textbox', { name: 'Sök kontakt' });
  await search.fill('ingen sådan kontakt');
  await expect(page.getByText('Inga kontakter matchar sökningen.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rensa kontaktsökning' }).click();
  await expect(name).toBeVisible();
});

test('validation errors are announced and remain readable for six seconds', async ({ page }) => {
  await page.goto('/contacts?qaDemo=1');
  await page.getByRole('button', { name: 'Lägg till kontakt', exact: true }).click();
  await page.clock.install();
  await page.getByText('Spara kontakt', { exact: true }).click();
  const error = page.locator('[aria-live="assertive"]').getByText('Ange ett namn.', { exact: true });
  await expect(error).toBeVisible();
  await page.clock.fastForward(5900);
  await expect(error).toBeVisible();
  await page.clock.fastForward(500);
  await expect(error).toHaveCount(0);
});
