export default async function run(page, ui) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  // Rellenar formulario de login con credenciales de prueba (el usuario real debe existir en Supabase)
  await page.evaluate(() => {
    const mail = document.querySelector('#loginEmail');
    const pass = document.querySelector('#loginPassword');
    if (mail) mail.value = 'valgom@admin.com';
    if (pass) pass.value = 'valgom2025';
  });
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Entrar');
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(4000);
  return await page.evaluate(() => ({
    clicked: true,
    error: document.querySelector('.auth-error, [class*=error]')?.textContent || '',
    main: document.getElementById('mainContent')?.innerText.slice(0, 200) || '',
    authHidden: document.getElementById('authScreen')?.hidden
  }));
}
