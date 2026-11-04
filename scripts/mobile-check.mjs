// SanoFarmacia — Revisa que ninguna pantalla tenga scroll lateral en distintos anchos (teléfono, tablet, PC)
// Uso: node mobile-check.mjs [url=http://127.0.0.1:5121/?emu=1] [carpeta]   (entra con la demo)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:5121/?emu=1';
const OUT = process.argv[3] || path.join(here, 'shots', 'mobile');
mkdirSync(OUT, { recursive: true });
const VIEWS = ['inicio', 'vender', 'pedidos', 'pacientes', 'recetas', 'fidelizar', 'inventario', 'compras', 'facturas', 'caja', 'reportes', 'ajustes'];
const SIZES = [
  { name: 'phone-320', width: 320, height: 640, mobile: true },
  { name: 'phone-360', width: 360, height: 760, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'tablet-1024', width: 1024, height: 768, mobile: true },
  { name: 'pc-1366', width: 1366, height: 768, mobile: false }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Elementos que se salen por la derecha (los más profundos) y ancho total del documento
const measure = ([label, W]) => ({
  label,
  vw: W, iw: innerWidth,
  sw: document.documentElement.scrollWidth,
  bw: document.body.scrollWidth,
  over: [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= W + 1) return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false;
    }
    return ![...el.children].some((c) => c.getBoundingClientRect().right > W + 1);
  }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}px`)
});

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let fails = 0;
for (const s of SIZES.filter((z) => !process.env.ONLY || z.name === process.env.ONLY)) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: s.width, height: s.height, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: s.mobile ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const check = async (label, shot) => {
    if (process.env.TRACE) console.log("  ·", label);
    const m = await page.evaluate(measure, [label, s.width]);
    const bad = m.sw > m.vw + 1 || m.iw > m.vw + 1 || (label !== 'pais' && m.over.length);
    if (bad) { fails++; console.log(`✗ ${s.name} ${label}: doc ${m.sw}px, ventana ${m.iw}px / pantalla ${m.vw}px`, m.over); }
    if (shot || bad) await page.screenshot({ path: path.join(OUT, `${s.name}-${label}.png`), fullPage: s.width === 360 });
  };
  await check('login', s.width <= 390);
  await page.click('#lg-demo');
  await page.waitForSelector('.country-grid [data-c="VE"]', { timeout: 60000 });
  await check('pais', s.width === 360);
  await page.click('.country-grid [data-c="VE"]'); await sleep(250);
  await page.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await page.waitForFunction(() => document.querySelector('.sb-nav') && !document.getElementById('boot'), { timeout: 120000 });
  await page.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => {});
  await sleep(800);
  await check('inicio-con-recorrido', s.mobile);
  await page.evaluate(async () => (await import('/js/tour.js')).stopTour());
  await sleep(500);
  for (const v of VIEWS) {
    await page.evaluate((v) => { location.hash = '#/' + v; }, v);
    await sleep(1300);
    if (v === 'reportes' && await page.$('.modal [data-pin]')) {
      await page.type('.modal [data-pin]', '1234'); await page.evaluate(() => document.querySelector('.modal [data-ok]').click()); await sleep(1500);
    }
    await check(v, s.width === 360);
  }
  const clickSel = (sel, text) => page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent || getComputedStyle(e).position === 'fixed').find((e) => !text || e.textContent.includes(text));
    if (el) el.click(); return !!el;
  }, sel, text);
  const closeModals = async () => { await page.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(400); };
  const tabsOf = async (label) => {
    const n = await page.$$eval('#view .tabs button', (x) => x.length).catch(() => 0);
    for (let i = 0; i < n; i++) { await page.evaluate((k) => document.querySelectorAll('#view .tabs button')[k]?.click(), i); await sleep(700); await check(`${label}-${i}`, s.width === 360); }
  };
  // Pestañas de cada módulo
  for (const v of ['pedidos', 'recetas', 'fidelizar', 'inventario', 'compras']) { await page.evaluate((r) => { location.hash = '#/' + r; }, v); await sleep(1100); await tabsOf(v); }
  // Pedidos: compartir catálogo
  await page.evaluate(() => { location.hash = '#/pedidos'; }); await sleep(1000);
  if (await clickSel('#o-share')) { await sleep(800); await check('pedidos-qr', s.width === 360); await closeModals(); }
  // Inventario: producto nuevo y ficha
  await page.evaluate(() => { location.hash = '#/inventario'; }); await sleep(1000);
  if (await clickSel('#i-new')) { await sleep(800); await check('producto-nuevo', s.width === 360); await closeModals(); }
  // Compras: recibir mercancía y proveedor nuevo
  await page.evaluate(() => { location.hash = '#/compras'; }); await sleep(1000);
  if (await clickSel('#p-rec')) { await sleep(800); await check('compras-recibir', s.width === 360); }
  // Pacientes: ficha con todas sus pestañas y paciente nuevo
  await page.evaluate(() => { location.hash = '#/pacientes'; }); await sleep(1200);
  if (await clickSel('#c-list [data-id]')) {
    await sleep(1500); await check('ficha-paciente', s.width === 360);
    const tabs = await page.$$eval('.modal [data-tabs] [data-t]', (x) => x.map((b) => b.dataset.t));
    for (const t of tabs) { if (await clickSel(`.modal [data-tabs] [data-t="${t}"]`)) { await sleep(700); await check(`ficha-${t}`, s.width === 360); } }
    await closeModals();
  } else { fails++; console.log(`✗ ${s.name}: no se abrió la ficha del paciente`); }
  if (await clickSel('#c-new')) { await sleep(700); await check('paciente-nuevo', s.width === 360); await closeModals(); }
  // Vender: presentación, carrito y pago
  await page.evaluate(() => { location.hash = '#/vender'; }); await sleep(1200);
  if (await clickSel('#pos-grid .prow')) { await sleep(700); await check('vender-presentacion', s.width === 360); await clickSel('.modal .pack-btn'); await sleep(400); }
  if (s.width <= 980) { await clickSel('#cart-fab'); await sleep(600); await check('vender-carrito', s.width === 360); }
  if (await clickSel('#c-pay')) { await sleep(1000); await check('vender-pago', s.width === 360); }
  await closeModals();
  // Configuración
  await page.evaluate(() => { location.hash = '#/ajustes'; }); await sleep(1000);
  for (const k of ['farmacia', 'moneda', 'convenios', 'vendedores', 'pedidos', 'fidelidad', 'recibos', 'seguridad', 'apps']) { if (await clickSel(`[data-s="${k}"]`)) { await sleep(600); await check(`ajustes-${k}`, false); } }
  // Búsqueda y ayuda
  await page.evaluate(() => { location.hash = '#/inicio'; }); await sleep(1000);
  if (await clickSel('#tb-search') || await clickSel('#sb-search')) { await sleep(600); await page.keyboard.type('Acet'); await sleep(900); await check('busqueda', s.width === 360); }
  await closeModals();
  await page.evaluate(async () => (await import('/js/tour.js')).openHelp?.()); await sleep(900); await check('ayuda', s.width === 360);
  await closeModals();
  // Consulta de precios
  await page.evaluate(() => { location.hash = '#/precios'; }); await sleep(1200); await check('precios', s.width === 360);
  await page.type('#k-q', 'acetaminofen'); await sleep(900); await check('precios-lista', s.width === 360);
  await page.evaluate(() => document.querySelector('.pck-list [data-p]')?.click()); await sleep(600); await check('precios-producto', s.width === 360);
  // Tarjeta pública y catálogo en línea
  const info = await page.evaluate(async () => { const { store } = await import('/js/store.js'); return { code: store.clients.find((m) => /María/.test(m.name))?.cardCode, slug: store.settings.shop?.slug }; });
  const pub = await ctx.newPage();
  await pub.setViewport({ width: s.width, height: s.height, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: s.mobile ? 2 : 1 });
  const emu = BASE.includes('emu=1') ? '?emu=1' : '';
  const pubCheck = async (label) => {
    const m = await pub.evaluate(measure, [label, s.width]);
    if (m.sw > m.vw + 1 || m.iw > m.vw + 1 || m.over.length) { fails++; console.log(`✗ ${s.name} ${label}: doc ${m.sw}px`, m.over); }
    if (s.width === 360) await pub.screenshot({ path: path.join(OUT, `${s.name}-${label}.png`), fullPage: true });
  };
  if (info.code) { await pub.goto(new URL(`/tarjeta/${info.code}`, BASE).href + emu, { waitUntil: 'networkidle2' }); await sleep(1500); await pubCheck('tarjeta'); }
  else { fails++; console.log(`✗ ${s.name}: sin tarjeta en la demo`); }
  if (info.slug) {
    await pub.goto(new URL(`/pedido/${info.slug}`, BASE).href + emu, { waitUntil: 'networkidle2' }); await sleep(2500);
    await pubCheck('catalogo');
    await pub.evaluate(() => document.querySelector('[data-inc]')?.click()); await sleep(300);
    await pub.evaluate(() => document.querySelector('#s-bar')?.click()); await sleep(600); await pubCheck('catalogo-pedido');
  } else { fails++; console.log(`✗ ${s.name}: sin catálogo en la demo`); }
  await pub.close();

  if (errs.length) { fails++; console.log(`✗ ${s.name} errores:`, errs); }
  console.log(`${s.name} revisado`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `FALLAS: ${fails}` : 'SIN SCROLL LATERAL EN NINGÚN ANCHO');
process.exit(fails ? 1 : 0);
