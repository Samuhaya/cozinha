// Teste rápido do app no tamanho de celular.
// Uso: node app/tests/smoke.cjs   (precisa do pacote "playwright"; prints em app/tests/screens/)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = path.join(__dirname, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
    await page.goto(APP + '#cardapio');
    await page.waitForTimeout(800);
    const tag = `[${scheme}]`;

    check(`${tag} abre sem erros`, errors.length === 0, errors.join(' | '));
    check(`${tag} sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${tag} avatares com imagem`, await page.locator('#hero .av-btn .av img').count() === 2);
    check(`${tag} 5 receitas de exemplo`, await page.locator('.rcard').count() === 5);
    await page.screenshot({ path: `${SHOTS}/${scheme}-1-cardapio.png` });
    if (scheme === 'dark') { await ctx.close(); continue; }

    // Nova receita em menos de 1 minuto
    await page.click('#fab');
    await page.fill('#ed-name', 'Strogonoff de teste');
    await page.fill('#ed-time', '25');
    await page.fill('#ed-ing-0-name', 'Cebola');
    await page.fill('#ed-ing-0-qty', '1');
    await page.fill('#ed-ing-1-name', 'Creme de leite');
    await page.fill('#ed-ing-1-qty', '200');
    await page.selectOption('#ed-ing-1-unit', 'g');
    check(`${tag} categoria sugerida (creme de leite → laticínios)`, (await page.inputValue('#ed-ing-1-cat')) === 'laticinios');
    await page.screenshot({ path: `${SHOTS}/light-2-nova-receita.png` });
    await page.click('[data-act="edSave"]');
    await page.waitForTimeout(600);
    check(`${tag} receita nova aparece`, await page.locator('.rcard', { hasText: 'Strogonoff de teste' }).count() === 1);

    // Favoritar
    await page.locator('.rcard', { hasText: 'Strogonoff de teste' }).locator('.heart').click();
    await page.click('[data-tab="favoritos"]');
    await page.waitForTimeout(400);
    check(`${tag} favorita aparece em Favoritos`, await page.locator('.rcard', { hasText: 'Strogonoff de teste' }).count() === 1);

    // Planejar na semana
    await page.click('[data-tab="semana"]');
    await page.waitForTimeout(400);
    const before = await page.locator('.slot.filled').count();
    await page.locator('.days .slot.empty').first().click();
    await page.locator('#plist .opt', { hasText: 'Strogonoff de teste' }).click();
    await page.waitForTimeout(500);
    check(`${tag} refeição entra na semana`, await page.locator('.slot.filled').count() === before + 1);
    await page.screenshot({ path: `${SHOTS}/light-3-semana.png` });

    // Lista de mercado
    await page.click('[data-tab="mercado"]');
    await page.waitForTimeout(400);
    const cebola = page.locator('.item', { hasText: /^\s*Cebola/ }).first();
    check(`${tag} mercado soma a cebola da receita nova`, (await cebola.textContent()).includes('Strogonoff de teste'));
    check(`${tag} refeições sem compra ficam fora da lista`, await page.locator('.item', { hasText: 'Marmita' }).count() === 0);
    await cebola.locator('.check').click();
    check(`${tag} marcar item risca`, await cebola.evaluate(el => el.classList.contains('done')));
    await page.fill('#xname', 'Papel toalha');
    await page.click('#addx button[type="submit"]');
    await page.waitForTimeout(300);
    check(`${tag} item avulso entra na lista`, await page.locator('.item', { hasText: 'Papel toalha' }).count() === 1);
    await page.screenshot({ path: `${SHOTS}/light-4-mercado.png`, fullPage: true });

    // Tags: criar e excluir
    await page.click('[data-tab="cardapio"]');
    await page.click('.vh-act [data-act="manageTags"]');
    await page.fill('#nt-name', 'Vegetariano');
    await page.fill('#nt-emoji', '🥦');
    await page.click('[data-act="mgNewTag"]');
    await page.waitForTimeout(300);
    check(`${tag} criar tag`, await page.locator('.sb input[data-tg$=".name"]').evaluateAll(els => els.some(e => e.value === 'Vegetariano')));
    const tagsBefore = await page.locator('.sb .tagrow').count();
    const del = page.locator('.sb .tagrow').last().locator('.del-btn');
    await del.click(); await del.click();
    await page.waitForTimeout(300);
    check(`${tag} excluir tag (com confirmação)`, await page.locator('.sb .tagrow').count() === tagsBefore - 1);
    await page.click('.sheet-close'); await page.waitForTimeout(350);

    // Tag nova direto no formulário de receita, sem perder o que foi digitado
    await page.click('#fab');
    await page.fill('#ed-name', 'Receita com tag nova');
    await page.fill('#nt-name', 'Rápida');
    await page.click('[data-act="edNewTag"]');
    await page.waitForTimeout(300);
    check(`${tag} tag criada no formulário já vem marcada`, await page.locator('.sb .tchip.on', { hasText: 'Rápida' }).count() === 1);
    check(`${tag} formulário mantém o nome digitado`, (await page.inputValue('#ed-name')) === 'Receita com tag nova');
    await page.click('[data-act="edSave"]'); await page.waitForTimeout(500);

    // Roleta
    await page.click('#hero [data-act="roleta"]');
    await page.waitForSelector('[data-act="rlPut"]', { timeout: 6000 });
    const sorteada = (await page.textContent('#rl-name')).trim();
    await page.click('[data-act="rlPut"][data-meal="d"]');
    await page.waitForTimeout(400);
    check(`${tag} roleta coloca a receita no jantar de hoje`, (await page.textContent('#hero .today')).includes(sorteada), sorteada);

    // Backup: copiar e restaurar
    await page.click('#hero [data-act="ajustes"]');
    const backup = await page.evaluate(() => JSON.stringify({ app: 'cozinha-lucca-izis', ...JSON.parse(localStorage.getItem('minha-cozinha-v1')) }));
    await page.fill('#bk-paste', backup.replace('Strogonoff de teste', 'Strogonoff restaurado'));
    await page.click('[data-act="bkPaste"]');
    const apply = page.locator('[data-act="bkApply"]');
    await apply.click(); await apply.click();
    await page.waitForTimeout(500);
    check(`${tag} restaurar backup`, await page.locator('.rcard', { hasText: 'Strogonoff restaurado' }).count() === 1);
    check(`${tag} status da sincronização aparece no topo`, /Só neste celular|Conectar a casa/.test(await page.textContent('#hero .sync')));

    // Dados continuam depois de recarregar
    await page.reload();
    await page.waitForTimeout(600);
    await page.click('[data-tab="mercado"]'); await page.waitForTimeout(300);
    check(`${tag} dados salvos após recarregar`, await page.locator('.item', { hasText: 'Papel toalha' }).count() === 1);
    check(`${tag} nenhum erro durante o uso`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verificações passaram. Prints em ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
