// SanoFarmacia — Prueba de punta a punta contra los emuladores (datos creados por test-emu.sh)
// Uso: node e2e.mjs [url=http://127.0.0.1:5121] [carpeta de capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5121';
const BASE = ORIGIN + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; let passed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? '  ✔' : '  ✘', name, extra); if (cond) passed++; else fails++; };
const errs = [];
const logs = [];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function newPage(w = 1366, h = 860) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.dismiss());
  p.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.text()); });
  return { ctx, p };
}
// Ejecuta una función con acceso a los módulos de la app
const run = (p, fn, arg = null) => p.evaluate(async (src, a) => {
  const M = { store: (await import('/js/store.js')).store, ops: await import('/js/ops.js'), utils: await import('/js/utils.js'), ph: await import('/js/pharma.js') };
  M.wait = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return f(); };
  return (0, eval)(src)(M, a);
}, fn.toString(), arg);
const go = async (p, route) => { await p.evaluate((r) => { location.hash = '#/' + r; }, route); await sleep(1100); };
const text = (p) => p.evaluate(() => document.body.innerText);
const pin = async (p, value = null) => {
  await p.waitForSelector('.modal [data-pin]', { timeout: 8000 });
  await p.type('.modal [data-pin]', value || acc.sede01.pin);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(900);
};
const pickCountry = async (p, code) => {
  await p.waitForSelector(`.country-grid [data-c="${code}"]`, { timeout: 60000 });
  await p.click(`.country-grid [data-c="${code}"]`); await sleep(250);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(1500);
};

try {
  // ==================================================================
  console.log('1) Inicio de sesión y país');
  let { ctx, p } = await newPage();
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.screenshot({ path: path.join(OUT, '01-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await pickCountry(p, 'VE');
  await p.waitForSelector('.sb-nav', { timeout: 30000 });
  ok('sede01 entra y elige país (Venezuela)', (await run(p, ({ store }) => store.settings.country)) === 'VE');
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());

  // ==================================================================
  console.log('2) Ajustes, productos con lotes y caja');
  const r1 = await run(p, async ({ store, ops, utils, wait }) => {
    const inD = (n) => utils.dayKey(utils.addDays(new Date(), n));
    await store.saveSettings({
      businessName: 'Farmacia Prueba', whatsapp: '04141234567', fractionMarkup: 10, requireRxData: true,
      agreements: [{ id: 'seg', name: 'Seguro Prueba', discount: 0, coverage: 80, scope: 'medicamentos', contact: '', active: true }],
      sellers: [{ id: 's1', name: 'Vendedor Uno', role: '', active: true }],
      loyalty: { enabled: true, per: 1, pointValue: 0.05, minRedeem: 100 }
    });
    await ops.openShift({ openingUSD: 50 });
    const sup = await ops.saveSupplier({ name: 'Droguería Prueba', days: 15 });
    const acet = await ops.saveProduct({ name: 'Acetaminofén 500 mg', active: 'Acetaminofén', strength: '500 mg', form: 'Tableta', category: 'Analgésicos y antiinflamatorios', rx: 'libre', unitsPerBox: 20, blister: 10, price: 2, cost: 1, minStock: 30, barcode: '7590000000017', supplierId: sup.id }, null, { units: 40, lot: 'LA', exp: inD(20) });
    const gen = await ops.saveProduct({ name: 'Acetaminofén genérico 500 mg', active: 'Acetaminofén', strength: '500 mg', form: 'Tableta', category: 'Analgésicos y antiinflamatorios', unitsPerBox: 20, blister: 10, price: 1.5, cost: 0.7, minStock: 0 }, null, { units: 40, lot: 'G1', exp: inD(300) });
    const amox = await ops.saveProduct({ name: 'Amoxicilina 500 mg', active: 'Amoxicilina', strength: '500 mg', form: 'Cápsula', category: 'Antibióticos', rx: 'antibiotico', unitsPerBox: 21, blister: 7, price: 7, cost: 3.5, minStock: 50 }, null, { units: 63, lot: 'AM1', exp: inD(200) });
    const losar = await ops.saveProduct({ name: 'Losartán 50 mg', active: 'Losartán', strength: '50 mg', form: 'Tableta', category: 'Cardiovasculares', rx: 'receta', unitsPerBox: 30, blister: 10, price: 5, cost: 2.5, minStock: 30 }, null, { units: 150, lot: 'LS1', exp: inD(400) });
    let dupBar = ''; try { await ops.saveProduct({ name: 'Otro', barcode: '7590000000017', price: 1 }); } catch (e) { dupBar = e.message; }
    await wait(() => store.products.length >= 4 && store.product(acet.id));
    await ops.receivePurchase({ supplierId: sup.id, invoiceNo: 'F-1', items: [{ productId: acet.id, boxes: 3, cost: 1.2, lot: 'LB', exp: inD(400) }], paid: 0, dueDate: inD(-1) });
    await wait(() => store.product(acet.id).stock === 100 && store.payables.length === 1);
    const a = store.product(acet.id);
    return { shift: !!store.openShift, stock: a.stock, lots: a.lots.map((l) => `${l.lot}:${l.qty}`).join(','), cost: a.cost, eq: (await import('/js/pharma.js')).equivalents(a, store.products).map((x) => x.name), byBar: store.byBarcode('7590000000017')?.id === acet.id, dupBar, payable: store.payables[0]?.balance, ids: { acet: acet.id, amox: amox.id, losar: losar.id, gen: gen.id } };
  });
  ok('Caja abierta', r1.shift);
  ok('Compra entra por lote y ordena por vencimiento (FEFO)', r1.stock === 100 && r1.lots === 'LA:40,LB:60', `${r1.stock} und · ${r1.lots}`);
  ok('Costo promedio ponderado al recibir', Math.abs(r1.cost - 1.12) < 0.01, String(r1.cost));
  ok('Encuentra por código de barras y rechaza duplicado', r1.byBar && /código de barras/.test(r1.dupBar), r1.dupBar);
  ok('Sugiere equivalente con el mismo principio activo', r1.eq.includes('Acetaminofén genérico 500 mg'), r1.eq.join(','));
  ok('Factura a crédito queda en cuentas por pagar', r1.payable === 3.6, String(r1.payable));
  const ID = r1.ids;

  // ==================================================================
  console.log('3) Venta por blíster y por unidad (lotes FEFO)');
  const r2 = await run(p, async ({ store, ops, ph, wait }, ID) => {
    const P = () => store.product(ID.acet);
    const line = (pack, qty) => { const p = P(); const f = ph.packFactor(p, pack); return { productId: p.id, name: p.name, pack, factor: f, qty, price: ph.packPrice(p, pack, store.settings.fractionMarkup), cost: ph.unitCost(p) * f }; };
    const s1 = await ops.chargeSale({ lines: [line('blister', 2)], payments: [{ method: 'efectivo', amount: 5 }], sellerId: 's1' });
    await wait(() => P().stock === 80);
    const after1 = P().lots.map((l) => `${l.lot}:${l.qty}`).join(',');
    const s2 = await ops.chargeSale({ lines: [line('unidad', 25)], payments: [{ method: 'efectivo', amount: 10 }] });
    await wait(() => P().stock === 55);
    let noStock = ''; try { await ops.chargeSale({ lines: [line('caja', 5)], payments: [{ method: 'efectivo', amount: 100 }] }); } catch (e) { noStock = e.message; }
    return { t1: s1.sale.total, ch1: s1.sale.changeUSD, n1: s1.sale.number, after1, lots: P().lots.map((l) => `${l.lot}:${l.qty}`).join(','), t2: s2.sale.total, used: s2.sale.items[0].lots, noStock, seller: s1.sale.sellerName };
  }, ID);
  ok('Blíster con recargo por fraccionar y vuelto', r2.t1 === 2.2 && r2.ch1 === 2.8 && /^F-\d{6}$/.test(r2.n1), `total ${r2.t1} · vuelto ${r2.ch1} · ${r2.n1}`);
  ok('Sale primero el lote que vence antes', r2.after1 === 'LA:20,LB:60', r2.after1);
  ok('Venta por unidades cruza de un lote al siguiente', r2.lots === 'LB:55' && /LA/.test(r2.used) && /LB/.test(r2.used), `${r2.lots} · ${r2.used}`);
  ok('No deja vender más de lo que hay', /No hay suficiente/.test(r2.noStock), r2.noStock);
  ok('Registra el vendedor', r2.seller === 'Vendedor Uno');

  // ==================================================================
  console.log('4) Recetas, convenio, crédito y tratamientos');
  const r3 = await run(p, async ({ store, ops, ph, utils, wait }, ID) => {
    const line = (id, pack = 'caja', qty = 1) => { const p = store.product(id); const f = ph.packFactor(p, pack); return { productId: p.id, name: p.name, pack, factor: f, qty, price: ph.packPrice(p, pack, 10), cost: ph.unitCost(p) * f }; };
    const c = await ops.saveClient({ name: 'Paciente Prueba', phone: '04241112233', idDoc: 'v-12345678', allergies: ['Penicilina'], conditions: ['Hipertensión'], agreementId: 'seg' });
    let dup = ''; try { await ops.saveClient({ name: 'Otro', phone: '04241112233' }); } catch (e) { dup = e.message; }
    await wait(() => store.client(c.id));
    let noRx = ''; try { await ops.chargeSale({ lines: [line(ID.amox)], payments: [{ method: 'efectivo', amount: 7 }] }); } catch (e) { noRx = e.message; }
    const sRx = await ops.chargeSale({ lines: [line(ID.amox)], payments: [{ method: 'efectivo', amount: 7 }], rx: { doctor: 'Dr. Prueba', license: 'MPPS 1', patient: 'Juan Pérez', patientId: 'V-1' } });
    await new Promise((r) => setTimeout(r, 800));
    const rxs = await store.listAll('prescriptions');
    // Convenio: el seguro cubre 80 %
    const sAg = await ops.chargeSale({ lines: [line(ID.losar)], client: { id: c.id }, agreementId: 'seg', rx: { doctor: 'Dra. Ana', license: 'MPPS 2' }, payments: [{ method: 'debito', amount: 1 }] });
    await wait(() => (store.client(c.id).points || 0) >= 1);
    // Crédito y abono
    await ops.chargeSale({ lines: [line(ID.gen)], client: { id: c.id }, credit: 1.5, payments: [] });
    const debt = await wait(() => store.client(c.id).balance > 0 && store.client(c.id).balance);
    await ops.payBalance(store.client(c.id), { amount: 1.5, payments: [{ method: 'efectivo', amount: 1.5 }] });
    await wait(() => store.client(c.id).balance < 0.01);
    // Tratamiento continuo → recompra
    await ops.saveTreatment(store.client(c.id), { productId: ID.losar, dailyUnits: 1, lastAt: utils.dayKey(utils.addDays(new Date(), -28)) });
    await wait(() => store.client(c.id).treatments?.length === 1);
    const t0 = store.client(c.id).treatments[0].nextAt;
    const due = store.dueRefills.some((x) => x.c.id === c.id);
    await ops.chargeSale({ lines: [line(ID.losar)], client: { id: c.id }, rx: { doctor: 'Dra. Ana' }, payments: [{ method: 'efectivo', amount: 1 }], agreementId: 'seg' });
    await wait(() => store.client(c.id).treatments[0].nextAt !== t0);
    const ms = await ops.addMeasure(store.client(c.id), { type: 'tension', value: 150, value2: 95 });
    const card = await (await import('/js/store.js')).getCard(store.client(c.id).cardCode);
    return {
      number: c.number, idDoc: c.idDoc, code: c.cardCode, dup, noRx, rxN: rxs.length, rx: rxs.find((x) => x.saleId === sRx.sale.id), agDue: sAg.sale.agreementDue, agTotal: sAg.sale.total,
      debt, bal: store.client(c.id).balance, t0, t1: store.client(c.id).treatments[0].nextAt, due, flag: ph.measureFlag('tension', ms.value, ms.value2)[0], card: !!card, cardPts: card?.points, id: c.id
    };
  }, ID);
  ok('Paciente con número, cédula normalizada y tarjeta', /^P-\d{4}$/.test(r3.number) && r3.idDoc === 'V-12345678' && !!r3.code, `${r3.number} · ${r3.idDoc}`);
  ok('Rechaza teléfono duplicado', /Ya existe/.test(r3.dup));
  ok('Antibiótico exige los datos de la receta', /receta/i.test(r3.noRx), r3.noRx);
  ok('La receta queda en el libro (retenida)', r3.rx && /^RX-\d{5}$/.test(r3.rx.number) && r3.rx.retained === true && r3.rx.items[0].lots === 'AM1', JSON.stringify(r3.rx && [r3.rx.number, r3.rx.retained, r3.rx.items[0].lots]));
  ok('Convenio: el seguro cubre 80 % y queda por cobrar', r3.agDue === 4 && r3.agTotal === 5, `total ${r3.agTotal} · cubre ${r3.agDue}`);
  ok('Venta a crédito y abono', r3.debt === 1.5 && r3.bal < 0.01, `${r3.debt} → ${r3.bal}`);
  ok('Tratamiento avisa recompra y se renueva al vender', r3.due && r3.t1 > r3.t0, `${r3.t0} → ${r3.t1}`);
  ok('Medición de tensión marcada como alta', r3.flag === 'Alta', r3.flag);
  ok('Tarjeta pública con puntos', r3.card && r3.cardPts >= 1, String(r3.cardPts));

  // ==================================================================
  console.log('5) Compras, pagos a proveedores, ajustes y anulación');
  const r4 = await run(p, async ({ store, ops, utils, wait }, ID) => {
    const sug = ops.suggestedOrder();
    const sup = store.suppliers[0];
    const oc = await ops.createPurchaseOrder({ supplierId: sup.id, items: sug.map((x) => ({ productId: x.p.id, boxes: x.boxes, cost: x.cost })) });
    const pu = store.payables[0];
    await ops.payPurchase(pu, { amount: 3.6, fromCash: true });
    await wait(() => !store.payables.length);
    const p0 = store.product(ID.gen);
    await ops.moveProduct(p0, { mode: 'merma', units: 2, reason: 'Rota' });
    await wait(() => store.product(ID.gen).stock === 18);
    const before = store.product(ID.amox).stock;
    const sale = (await store.listAll('sales')).find((s) => s.items?.some((i) => i.productId === ID.amox) && s.status !== 'voided');
    await ops.voidSale(sale, 'prueba');
    await wait(() => store.product(ID.amox).stock === before + 21);
    return { sug: sug.map((x) => x.p.name), oc: oc.number, status: oc.status, payables: store.payables.length, gen: store.product(ID.gen).stock, amox: store.product(ID.amox).stock, before };
  }, ID);
  ok('Sugerido de compra con lo que está bajo el mínimo', r4.sug.length >= 1, r4.sug.join(', '));
  ok('Orden de compra creada', /^OC-\d{5}$/.test(r4.oc) && r4.status === 'pedido', r4.oc);
  ok('Pago al proveedor desde la caja salda la factura', r4.payables === 0);
  ok('Merma descuenta unidades', r4.gen === 18, String(r4.gen));
  ok('Anular devuelve el producto a su lote', r4.amox === r4.before + 21, `${r4.before} → ${r4.amox}`);

  // ==================================================================
  console.log('6) Catálogo en línea y pedido desde el teléfono');
  const slug = 'farmacia-prueba-e2e';
  const r5 = await run(p, async ({ store, ops }, sl) => {
    await store.saveSettings({ shop: { ...store.settings.shop, enabled: true, slug: sl, delivery: true, deliveryFee: 1 } });
    await ops.publishShop({ force: true });
    const d = await (await import('/js/store.js')).getShop(sl);
    return { ok: !!d, items: d?.items?.length };
  }, slug);
  ok('Catálogo publicado', r5.ok && r5.items >= 4, JSON.stringify(r5));
  const pubCtx = await browser.createBrowserContext();
  const pub = await pubCtx.newPage();
  await pub.setViewport({ width: 390, height: 844, isMobile: true });
  pub.on('pageerror', (e) => errs.push('público: ' + e.message));
  await pub.goto(`${ORIGIN}/pedido/${slug}?emu=1`, { waitUntil: 'networkidle2' });
  await pub.waitForSelector('[data-inc]', { timeout: 20000 });
  await pub.screenshot({ path: path.join(OUT, '04-catalogo.png') });
  await pub.type('#s-q', 'losartan'); await sleep(500);
  await pub.click('[data-inc]'); await sleep(200); await pub.click('[data-inc]'); await sleep(200);
  await pub.click('#s-bar'); await sleep(500);
  await pub.click('[data-mode="delivery"]'); await sleep(200);
  await pub.type('input[name="name"]', 'Cliente Web'); await pub.type('input[name="phone"]', '04261234567'); await pub.type('input[name="address"]', 'Calle 1, casa 2');
  await pub.screenshot({ path: path.join(OUT, '04-checkout.png') });
  await pub.click('#o-send'); await sleep(2500);
  ok('Cliente envía el pedido sin cuenta', (await pub.evaluate(() => document.body.innerText)).includes('¡Pedido enviado!'));
  await pub.screenshot({ path: path.join(OUT, '04-pedido-ok.png') });
  await pub.goto(`${ORIGIN}/tarjeta/${r3.code}?emu=1`, { waitUntil: 'networkidle2' });
  await pub.waitForSelector('.mcard', { timeout: 20000 }); await sleep(800);
  const ct = await pub.evaluate(() => document.body.innerText);
  ok('Tarjeta pública con nombre, tratamiento y QR', ct.includes('Paciente Prueba') && ct.includes('Losartán') && !!(await pub.$('.mcard-qr img')), ct.replace(/\s+/g, ' ').slice(0, 100));
  await pub.screenshot({ path: path.join(OUT, '05-tarjeta.png'), fullPage: true });
  await pub.goto(`${ORIGIN}/tarjeta/NOEXISTE1?emu=1`, { waitUntil: 'networkidle2' }); await sleep(1500);
  ok('Tarjeta inexistente muestra aviso', (await pub.evaluate(() => document.body.innerText)).includes('Tarjeta no encontrada'));
  await pub.goto(`${ORIGIN}/pedido/no-existe-nada?emu=1`, { waitUntil: 'networkidle2' }); await sleep(1500);
  ok('Catálogo inexistente muestra aviso', (await pub.evaluate(() => document.body.innerText)).includes('Catálogo no'));
  await pubCtx.close();
  const r6 = await run(p, async ({ store, ops, ph, wait }) => {
    const o = await wait(() => store.newOrders.find((x) => x.name === 'Cliente Web'), 10000);
    if (!o) return { got: false };
    await ops.setOrderStatus(o, 'preparando');
    await wait(() => store.orders.find((x) => x.id === o.id)?.status === 'preparando');
    const lines = ops.orderLines(o);
    const total = lines.reduce((a, l) => a + l.price * l.qty, 0) + (o.deliveryFee || 0);
    await ops.chargeSale({ lines, orderId: o.id, delivery: o.deliveryFee, rx: { doctor: 'Dr. Web' }, payments: [{ method: 'efectivo', amount: total }] });
    await wait(() => store.orders.find((x) => x.id === o.id)?.status === 'entregada' || !store.pendingOrders.some((x) => x.id === o.id));
    return { got: true, n: lines.length, q: lines[0]?.qty, total: o.total, status: store.orders.find((x) => x.id === o.id)?.status || 'entregada' };
  });
  ok('La farmacia recibe el pedido en vivo', r6.got);
  ok('Cobrar el pedido lo marca entregado', r6.status === 'entregada' && r6.q === 2 && r6.total === 11, JSON.stringify(r6));

  // ==================================================================
  console.log('7) Pantallas, pestañas, reportes y consulta de precios');
  const before = errs.length;
  const tabsCount = {};
  for (const v of ['inicio', 'vender', 'pedidos', 'pacientes', 'recetas', 'fidelizar', 'inventario', 'compras', 'facturas', 'caja', 'ajustes']) {
    await go(p, v);
    await p.screenshot({ path: path.join(OUT, `10-${v}.png`) });
    const n = await p.$$eval('#view .tabs button', (x) => x.length).catch(() => 0);
    tabsCount[v] = n;
    for (let i = 0; i < n; i++) { await p.evaluate((k) => document.querySelectorAll('#view .tabs button')[k]?.click(), i); await sleep(600); }
  }
  await go(p, 'vender');
  await p.type('#pos-search', 'acetamin'); await sleep(700);
  await p.click('#pos-grid .prow'); await sleep(600);
  await p.screenshot({ path: path.join(OUT, '11-presentacion.png') });
  const packs = await p.$$eval('.modal .pack-btn', (x) => x.length);
  await p.click('.modal .pack-btn[data-k="blister"]'); await sleep(500);
  const cartTxt = await p.evaluate(() => document.querySelector('#c-total')?.textContent || '');
  ok('En Vender elige caja, blíster o unidad', packs === 3 && /1,10/.test(cartTxt), `${packs} · ${cartTxt}`);
  await go(p, 'reportes'); await pin(p); await sleep(2200);
  const rt = await text(p);
  ok('Reportes con PIN muestran ganancia y productos', /ganancia/i.test(rt) && rt.includes('Acetaminofén'));
  await p.screenshot({ path: path.join(OUT, '10-reportes.png'), fullPage: true });
  await p.evaluate(async (id) => (await import('/js/client.js')).openClient(id), r3.id); await sleep(1500);
  const tabs = await p.$$eval('.modal [data-tabs] [data-t]', (x) => x.map((b) => b.dataset.t));
  for (const t of tabs) { await p.click(`.modal [data-tabs] [data-t="${t}"]`).catch(() => {}); await sleep(800); }
  await p.screenshot({ path: path.join(OUT, '12-ficha.png') });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals());
  ok('Todas las pantallas y pestañas sin errores', errs.length === before && tabsCount.inventario >= 5 && tabsCount.compras >= 4 && tabs.length >= 4, errs.slice(before).join(' | ') + ' · ' + JSON.stringify(tabsCount) + ` · ficha ${tabs.join(',')}`);
  await go(p, 'precios'); await sleep(800);
  await p.type('#k-q', '7590000000017'); await p.keyboard.press('Enter'); await sleep(700);
  const kt = await text(p);
  ok('Consulta de precios por código de barras', kt.includes('Acetaminofén 500 mg') && /Blíster/.test(kt), kt.replace(/\s+/g, ' ').slice(0, 80));
  await p.screenshot({ path: path.join(OUT, '13-precios.png') });
  await p.click('#k-exit'); await pin(p); await sleep(800);
  ok('Salir de la consulta de precios con PIN', (await p.evaluate(() => location.hash)).includes('inicio'));
  const r9 = await run(p, async ({ store, ops, wait }) => { const s = store.openShift; const e = ops.shiftExpected(s); await ops.closeShift(s, { countedUSD: e.usd }); return { closed: !!(await wait(() => !store.openShift)), exp: e.usd }; });
  ok('Cierre de caja', r9.closed, `esperado ${r9.exp}`);
  await ctx.close();

  // ==================================================================
  console.log('8) Demo');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.click('#lg-demo');
  await pickCountry(p, 'CO');
  await p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 150000 });
  await sleep(3000);
  const d = await run(p, async ({ store }) => ({
    clients: store.clients.length, products: store.products.length, sales: store.recentSales.length, shift: !!store.openShift, cur: store.settings.currency,
    acet: store.product('demo_acet')?.price, orders: store.pendingOrders.length, refills: store.dueRefills.length, expiring: store.expiringProducts.length, expired: store.expiredLots.length,
    low: store.lowProducts.length, payables: store.payables.length, rx: (await store.listAll('prescriptions')).length, ag: store.activeAgreements.length
  }));
  ok('Demo con farmacia de ejemplo completa', d.clients >= 16 && d.products >= 30 && d.sales >= 30 && d.shift && d.orders >= 3 && d.refills >= 4 && d.expiring >= 4 && d.expired >= 1 && d.low >= 1 && d.payables >= 2 && d.rx >= 10 && d.ag === 3, JSON.stringify(d));
  ok('Precios de la demo en pesos colombianos', d.cur === 'COP' && d.acet > 1000, String(d.acet));
  ok('Recorrido guiado abierto al entrar', !!(await p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => null)));
  await p.screenshot({ path: path.join(OUT, '20-demo-tour.png') });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const b2 = errs.length;
  for (const v of ['inicio', 'vender', 'pedidos', 'pacientes', 'recetas', 'fidelizar', 'inventario', 'compras', 'facturas', 'caja']) { await go(p, v); await sleep(500); await p.screenshot({ path: path.join(OUT, `21-demo-${v}.png`) }); }
  ok('Pantallas de la demo sin errores', errs.length === b2, errs.slice(b2).join(' | '));
  const codes = await run(p, ({ store }) => store.clients.map((m) => m.cardCode));
  const dslug = await run(p, ({ store }) => store.settings.shop?.slug);
  const uid = await p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await p.evaluate(() => document.getElementById('demo-end').click());
  await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
  await p.waitForSelector('#login-form', { timeout: 60000 }).catch(async (e) => { await p.screenshot({ path: path.join(OUT, '29-demo-fin.png') }); console.log('LOGS', logs.slice(-15).join(' || ')); throw e; });
  ok('Terminar la demo vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('9) Administrador general');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.type('#lg-user', 'admin'); await p.type('#lg-pass', acc.admin.password); await p.click('#lg-btn');
  await p.waitForSelector('[data-enter]', { timeout: 30000 }); await sleep(2000);
  ok('Admin ve las sedes', (await p.$$('[data-enter]')).length === 3);
  await p.screenshot({ path: path.join(OUT, '30-admin.png') });
  const gone = await p.evaluate(async (u, cs, sl) => {
    const f = await import('/js/firebase.js');
    const t = await f.getDoc(f.doc(f.db, 'tenants', u)); const c = await f.getDoc(f.doc(f.db, 'cards', cs[0]));
    const b = sl ? await f.getDoc(f.doc(f.db, 'shops', sl)) : null;
    return !t.exists() && !c.exists() && !(b && b.exists());
  }, uid, codes, dslug);
  ok('La demo, sus tarjetas y su catálogo se borraron', gone, String(dslug));
  await ctx.close();
} catch (e) { console.log('ERROR', e.stack || e.message); fails++; }
await browser.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(`${passed} OK · ${fails} fallas`);
process.exit(fails ? 1 : 0);
