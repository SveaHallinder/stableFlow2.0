import { expect, test } from '@playwright/test';

for (const width of [390, 1024, 1280]) {
  test(`member list remains visible beside its filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // Demo fixtures only; prevent any unexpected persistence from reaching Supabase.
    await page.route('**/rest/v1/**', route => route.abort('blockedbyclient'));
    await page.goto('/members?qaDemo=1');
    const member = page.getByText('QA Medlem', { exact: true });
    await expect(member).toBeVisible();
    const memberBox = await member.boundingBox();
    expect(memberBox.width).toBeGreaterThan(0);
    expect(memberBox.x + memberBox.width).toBeLessThanOrEqual(width);
    const row = member.locator('..').locator('..');
    const role = row.getByRole('button', { name: 'Ryttare', exact: true });
    await expect(role).toBeVisible();
    const roleBox = await role.boundingBox();
    expect(roleBox.x + roleBox.width).toBeLessThanOrEqual(width);
    for (const contact of [row.getByText(/qa-member@example\.com/), row.getByText(/070-000 00 02/)]) {
      await expect(contact).toBeVisible();
      const contactBox = await contact.boundingBox();
      expect(contactBox.width).toBeGreaterThan(0);
      expect(contactBox.x + contactBox.width).toBeLessThanOrEqual(roleBox.x);
      if (width < 1280) {
        const contactFits = await contact.evaluate(element => element.scrollWidth <= element.clientWidth);
        expect(contactFits).toBe(true);
      }
    }
    const search = page.getByPlaceholder('Sök namn, roll, häst...');
    await search.fill('Ingen sådan medlem');
    const empty = page.getByText('Inga medlemmar matchar filtret.', { exact: true });
    await expect(empty).toBeVisible();
    const emptyBox = await empty.boundingBox();
    expect(emptyBox.x + emptyBox.width).toBeLessThanOrEqual(width);
    await search.fill('QA Medlem');
    await member.click();
    await expect(page).toHaveURL(/\/members\/00000000-0000-4000-8000-000000000002/);
    await expect(page.getByText('QA Medlem', { exact: true }).last()).toBeVisible();
  });
}
