import { expect, test } from '@playwright/test';

test('first-run setup, parent transaction, child scoping, and import', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Skapa föräldrakonto' })).toBeVisible();
  await page.getByLabel('Lösenord').fill('parent123');
  await page.getByRole('button', { name: 'Kom igång' }).click();
  await expect(page.getByRole('heading', { name: 'Sparkonto Barn' })).toBeVisible();

  await page.getByLabel(/Användare /).click();
  await page.getByRole('menuitem', { name: 'Inställningar' }).click();
  await expect(page.getByRole('heading', { name: 'Hantera appen' })).toBeVisible();
  await page.getByLabel('Nytt barn').fill('Anna');
  await page.getByRole('button', { name: 'Lägg till' }).click();
  await expect(page.getByRole('button', { name: 'Anna' })).toBeVisible();

  await page.getByLabel('Användarnamn').fill('anna');
  await page.getByLabel('Nytt lösenord').fill('anna12345');
  await page.getByRole('button', { name: 'Spara inloggning' }).click();
  await expect(page.getByText('Barninloggningen sparades.')).toBeVisible();

  await page.getByRole('button', { name: 'Till översikt' }).click();
  await expect(page.getByRole('heading', { name: 'Sparkonto Barn' })).toBeVisible();
  await page.getByRole('button', { name: 'Ny transaktion' }).click();

  await page.getByLabel('Belopp (kr)').fill('100');
  await page.getByLabel('Kommentar').fill('Present');
  await page.getByRole('button', { name: 'Spara', exact: true }).click();
  await expect(page.getByText('100,00 kr').first()).toBeVisible();

  await page.getByLabel('CSV-import').fill('childName,account,type,amountOre,date,comment\nAnna,fond,deposit,2500,2026-05-05,"Fond, maj"\n');
  await page.getByRole('button', { name: 'Validera' }).click();
  await expect(page.getByText('1 giltiga rader')).toBeVisible();
  await page.getByRole('button', { name: 'Importera' }).click();
  await expect(page.getByText('25,00 kr').first()).toBeVisible();

  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
  await page.getByLabel('Användarnamn').fill('anna');
  await page.getByLabel('Lösenord').fill('anna12345');
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page.getByRole('heading', { name: 'Anna' })).toBeVisible();
  await expect(page.getByText('Ny transaktion')).toHaveCount(0);
  await expect(page.getByText('100,00 kr').first()).toBeVisible();
  await expect(page.getByText('25,00 kr').first()).toBeVisible();
});
