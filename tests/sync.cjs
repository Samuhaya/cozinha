// Testa a sincronização com dois "celulares" (Lucca e Izis) usando um banco falso em memória.
// Uso: node app/tests/sync.cjs            (imita o banco do link do Claude)
//      BACKEND=firebase node app/tests/sync.cjs   (imita o Firebase, com código da casa)
const path = require('path');
const { chromium } = require('playwright');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const FB = process.env.BACKEND === 'firebase';

const store = new Map();           // caminho -> dados
const subs = [];                   // {page, id, kind, path}
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };

function payload(s) {
  if (s.kind === 'doc') { const d = store.get(s.path); return { exists: !!d, data: d || null, id: s.path.split('/').pop() }; }
  const docs = [...store.entries()].filter(([p]) => p.startsWith(s.path + '/') && !p.slice(s.path.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), data: d }));
  return { docs };
}
async function notify(changed) {
  for (const s of subs) {
    if (s.kind === 'doc' ? s.path !== changed : !changed.startsWith(s.path + '/')) continue;
    await s.page.evaluate(([id, p]) => window.__dbPush(id, p), [s.id, payload(s)]).catch(() => {});
  }
}
const FAKE = () => {
  const cbs = {}; let n = 0;
  window.__dbPush = (id, p) => { const cb = cbs[id]; if (!cb) return; const meta = { fromCache: false, hasPendingWrites: false };
    if ('docs' in p) cb({ docs: p.docs.map(d => ({ id: d.id, exists: true, data: () => d.data, metadata: meta })), size: p.docs.length, empty: !p.docs.length, metadata: meta, docChanges: () => [] });
    else cb({ id: p.id, exists: p.exists, data: () => p.data || undefined, metadata: meta }); };
  const sub = (kind, path, cb) => { const id = 's' + (n++); cbs[id] = cb; window.__dbSub(id, kind, path); return () => delete cbs[id]; };
  const db = {
    doc: p => ({ set: d => window.__dbSet(p, d), update: d => window.__dbSet(p, d), delete: () => window.__dbDel(p), get: async () => ({}), onSnapshot: (cb) => sub('doc', p, cb) }),
    collection: c => ({ onSnapshot: (cb) => sub('col', c, cb), doc: id => db.doc(c + '/' + id) })
  };
  window.claude = { use: async name => name === 'db' ? db : name === 'user' ? { can: async () => true } : null };
};
// Firebase falso (formato "compat"), servido no lugar dos scripts do gstatic
const FAKE_FB = `(() => {
  const cbs = {}; let n = 0;
  window.__dbPush = (id, p) => { const cb = cbs[id]; if (!cb) return; const meta = { fromCache: false, hasPendingWrites: false };
    if ('docs' in p) cb({ docs: p.docs.map(d => ({ id: d.id, exists: true, data: () => d.data, metadata: meta })), metadata: meta });
    else cb({ id: p.id, exists: p.exists, data: () => p.data || undefined, metadata: meta }); };
  const sub = (kind, path, cb) => { const id = 's' + (n++); cbs[id] = cb; window.__dbSub(id, kind, path); return () => delete cbs[id]; };
  // como o Firestore real: onSnapshot(opções, cb, erro) ou onSnapshot(cb, erro)
  const pick = a => typeof a[0] === 'function' ? a[0] : a[1];
  const fs = { doc: p => ({ set: d => window.__dbSet(p, d), delete: () => window.__dbDel(p), onSnapshot: (...a) => sub('doc', p, pick(a)) }),
               collection: c => ({ onSnapshot: (...a) => sub('col', c, pick(a)) }) };
  window.firebase = { apps: [], initializeApp(c) { this.apps.push(c); }, auth: () => ({ signInAnonymously: async () => ({}) }), firestore: () => fs };
})();`;

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeBinding('__dbSub', async ({ page: pg }, id, kind, p) => { const s = { page: pg, id, kind, path: p }; subs.push(s); setTimeout(() => pg.evaluate(([i, pl]) => window.__dbPush(i, pl), [id, payload(s)]).catch(() => {}), 20); });
  await page.exposeBinding('__dbSet', async (_, p, d) => { store.set(p, JSON.parse(JSON.stringify(d))); setTimeout(() => notify(p), 30); });
  await page.exposeBinding('__dbDel', async (_, p) => { store.delete(p); setTimeout(() => notify(p), 30); });
  if (FB) {
    await page.addInitScript(() => Object.defineProperty(window, 'FIREBASE_CONFIG', { get: () => ({ projectId: 'teste' }), set() {} }));
    await page.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? FAKE_FB : '' }));
  } else await page.addInitScript(FAKE);
  await page.goto(APP + (name === 'Izis' && FB ? '?casa=' + CASA.code : '') + '#semana');
  await page.waitForTimeout(700);
  page.__errors = errors; page.__name = name;
  return page;
}

const CASA = { code: '' };
(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const lucca = await phone(browser, 'Lucca');
  if (FB) {
    check('sem código, pede para conectar a casa', (await lucca.textContent('#hero .sync')).includes('Conectar a casa'));
    await lucca.click('#hero .sync'); await lucca.click('[data-act="casaNew"]');
    await lucca.waitForTimeout(900);
    CASA.code = await lucca.evaluate(() => localStorage.getItem('cozinha-casa'));
    check('código da casa criado', /^casa-[a-z0-9]{14}$/.test(CASA.code || ''), CASA.code);
  }
  check('banco vazio pede para ligar a sincronização', (await lucca.textContent('#hero .sync')).includes('Ligar sincronização'));
  await lucca.click('#hero .sync');
  await lucca.click('[data-act="initSync"]');
  await lucca.waitForTimeout(1500);
  const P = FB ? 'casas/' + CASA.code + '/' : '';
  check('Lucca liga e envia os dados', store.has(P + 'kitchen/meta') && [...store.keys()].filter(k => k.startsWith(P + 'recipes/')).length === 5, [...store.keys()].length + ' documentos');
  check('status vira "Sincronizado"', (await lucca.textContent('#hero .sync')).includes('Sincronizado'));
  await lucca.click('.sheet-close'); await lucca.waitForTimeout(350);

  const izis = await phone(browser, 'Izis');
  await izis.waitForTimeout(800);
  check('Izis abre e já vê sincronizado', (await izis.textContent('#hero .sync')).includes('Sincronizado'));
  const luccaSlots = await lucca.locator('.slot.filled').count();
  check('Izis vê a mesma semana do Lucca', await izis.locator('.slot.filled').count() === luccaSlots, `${luccaSlots} refeições`);

  // Izis cria uma receita, Lucca recebe
  await izis.click('[data-tab="cardapio"]');
  await izis.click('#fab');
  await izis.fill('#ed-name', 'Curry da Izis');
  await izis.fill('#ed-ing-0-name', 'Leite de coco'); await izis.fill('#ed-ing-0-qty', '200'); await izis.selectOption('#ed-ing-0-unit', 'ml');
  await izis.click('[data-act="edSave"]');
  await izis.waitForTimeout(1500);
  await lucca.click('[data-tab="cardapio"]'); await lucca.waitForTimeout(300);
  check('receita da Izis aparece no Lucca', await lucca.locator('.rcard', { hasText: 'Curry da Izis' }).count() === 1);

  // Lucca planeja, Izis vê no mercado
  await lucca.click('[data-tab="semana"]');
  await lucca.locator('.days .slot.empty').first().click();
  await lucca.locator('#plist .opt', { hasText: 'Curry da Izis' }).click();
  await lucca.waitForTimeout(1500);
  await izis.click('[data-tab="mercado"]'); await izis.waitForTimeout(300);
  check('lista do mercado da Izis ganha o leite de coco', await izis.locator('.item', { hasText: 'Leite de coco' }).count() === 1);

  // Izis marca no mercado, Lucca vê marcado
  await izis.locator('.item', { hasText: 'Leite de coco' }).locator('.check').click();
  await izis.waitForTimeout(1500);
  await lucca.click('[data-tab="mercado"]'); await lucca.waitForTimeout(300);
  check('item marcado pela Izis aparece marcado no Lucca', await lucca.locator('.item.done', { hasText: 'Leite de coco' }).count() === 1);

  // Lucca exclui a receita, some na Izis
  await lucca.click('[data-tab="cardapio"]'); await lucca.waitForTimeout(200);
  await lucca.locator('.rcard', { hasText: 'Curry da Izis' }).click();
  const del = lucca.locator('[data-act="delRecipe"]'); await del.click(); await del.click();
  await lucca.waitForTimeout(1500);
  await izis.click('[data-tab="cardapio"]'); await izis.waitForTimeout(300);
  check('receita excluída some no celular da Izis', await izis.locator('.rcard', { hasText: 'Curry da Izis' }).count() === 0);
  check('nenhum erro nos dois celulares', !lucca.__errors.length && !izis.__errors.length, [...lucca.__errors, ...izis.__errors].join(' | '));

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} verificações de sincronização passaram.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
