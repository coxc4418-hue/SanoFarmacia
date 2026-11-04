// SanoFarmacia — Compras: sugerido de compra, órdenes a droguerías, recepción por lote, proveedores y cuentas por pagar
import { store } from '../store.js';
import { saveSupplier, suggestedOrder, createPurchaseOrder, receivePurchase, payPurchase, cancelPurchaseOrder } from '../ops.js';
import { esc, usd, num, emptyState, fmtDate, fmtDateTime, toast, openModal, setBusy, todayKey, parseNum, round2, confirmDialog, waLink, normalize, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { upb, stockText, productLine, searchText, rxBadge } from '../pharma.js';
import { printDoc } from '../shared.js';
import { productForm } from './inventory.js';

const TABS = { sugerido: 'Sugerido de compra', ordenes: 'Órdenes y recepciones', recibir: 'Recibir mercancía', proveedores: 'Proveedores', pagar: 'Por pagar' };

export function mount(el, { params = {} }) {
  let tab = TABS[params.tab] ? params.tab : 'sugerido';
  let receiveFrom = null;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Compras y proveedores</h1><p class="view-sub" id="p-sub"></p></div>
      <div class="view-actions"><button class="btn btn-primary" id="p-rec">${icon('truck')} Recibir mercancía</button></div></div>
    <div class="tabs" id="p-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}<span class="tab-n" data-n="${k}" hidden></span></button>`).join('')}</div>
    <div id="p-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  function head() {
    const over = store.payables.filter((p) => p.dueDate && p.dueDate <= todayKey());
    $('#p-sub').textContent = `${store.suppliers.length} proveedor(es) · por pagar ${usd(store.totalPayable)}${over.length ? ` · ${over.length} factura(s) vencida(s)` : ''}`;
    const set = (k, n) => { const b = el.querySelector(`[data-n="${k}"]`); if (b) { b.hidden = !n; b.textContent = n; } };
    set('sugerido', store.lowProducts.length); set('pagar', store.payables.length);
  }
  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    head();
    ({ sugerido, ordenes, recibir, proveedores, pagar })[tab]();
  }

  // ---------------- SUGERIDO ----------------
  function sugerido() {
    let sup = '';
    const paint = () => {
      const list = suggestedOrder(sup || null);
      const total = list.reduce((a, x) => a + x.boxes * x.cost, 0);
      $('#p-body').innerHTML = `<div class="card card-flush">
        <div class="toolbar"><div class="small muted">Lo que está en o bajo el mínimo, hasta llegar al máximo. Ajusta las cajas y genera la orden.</div>
          <select class="select select-sm" id="s-sup" style="width:auto"><option value="">Todos los proveedores</option>${store.suppliers.map((s) => `<option value="${s.id}" ${sup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        ${list.length ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Producto</th><th class="r">Hay</th><th class="r">Mín / máx</th><th class="r" style="width:110px">Cajas</th><th class="r">Costo caja</th><th class="r">Subtotal</th></tr></thead><tbody>${list.map((x, i) => `<tr><td><b>${esc(x.p.name)}</b><div class="t-sub">${esc(productLine(x.p))}${x.p.supplierId && store.supplier(x.p.supplierId) ? ' · ' + esc(store.supplier(x.p.supplierId).name) : ''}</div></td><td class="r ${(Number(x.p.stock) || 0) <= 0 ? 'text-danger' : ''}">${(Number(x.p.stock) || 0) <= 0 ? 'Agotado' : stockText(x.p)}</td><td class="r small">${x.p.minStock || 0} / ${x.p.maxStock || '—'} und</td><td class="r"><input class="input input-sm r" data-bx="${i}" inputmode="numeric" value="${x.boxes}"></td><td class="r">${usd(x.cost)}</td><td class="r num" data-st="${i}">${usd(x.boxes * x.cost)}</td></tr>`).join('')}</tbody></table></div>
          <div class="between" style="padding:14px 16px"><b>Total estimado: <span id="s-tot">${usd(total)}</span></b><div class="row" style="gap:6px"><button class="btn btn-secondary" id="s-print">${icon('print')} Imprimir</button><button class="btn btn-primary" id="s-make">${icon('check')} Crear orden de compra</button></div></div>`
          : `<div style="padding:8px 16px 20px">${emptyState('checkCircle', 'Nada por pedir', 'Todos los productos están por encima de su mínimo. Define el mínimo y máximo de cada producto en Inventario.')}</div>`}
      </div>`;
      $('#s-sup').onchange = (e) => { sup = e.target.value; paint(); };
      el.querySelectorAll('[data-bx]').forEach((i) => i.oninput = () => { const x = list[+i.dataset.bx]; x.boxes = Math.max(0, Math.round(parseNum(i.value))); el.querySelector(`[data-st="${i.dataset.bx}"]`).textContent = usd(x.boxes * x.cost); $('#s-tot').textContent = usd(list.reduce((a, y) => a + y.boxes * y.cost, 0)); });
      $('#s-make')?.addEventListener('click', async (e) => {
        if (!sup && store.suppliers.length) { const ok = await confirmDialog({ title: 'Sin proveedor', message: 'La orden se creará sin proveedor. Mejor elige el proveedor arriba para pedirle solo lo suyo. ¿Continuar igual?', confirmText: 'Continuar' }); if (!ok) return; }
        setBusy(e.currentTarget, true);
        try { const o = await createPurchaseOrder({ supplierId: sup || null, items: list.map((x) => ({ productId: x.p.id, name: x.p.name, boxes: x.boxes, cost: x.cost })) }); toast(`Orden ${o.number} creada`); sendOrder(o); tab = 'ordenes'; draw(); }
        catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
      });
      $('#s-print')?.addEventListener('click', () => printDoc('Sugerido de compra', `<p>${esc(store.businessName)} · ${fmtDateTime(new Date().toISOString())}</p><table><thead><tr><th>Producto</th><th>Laboratorio</th><th>Existencia</th><th>Cajas</th><th class="r">Costo</th></tr></thead><tbody>${list.map((x) => `<tr><td>${esc(x.p.name)}</td><td>${esc(x.p.lab || '')}</td><td>${Number(x.p.stock) || 0} und</td><td>${x.boxes}</td><td class="r">${usd(x.boxes * x.cost)}</td></tr>`).join('')}</tbody></table>`));
    };
    paint();
  }

  // ---------------- ÓRDENES ----------------
  async function ordenes() {
    $('#p-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    let list = [];
    try { list = (await store.listAll('purchases')).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 100); } catch (e) { console.error(e); }
    if (tab !== 'ordenes') return;
    const ST = { pedido: ['Pedida', 'info'], recibida: ['Recibida', 'success'], anulada: ['Anulada', 'danger'] };
    $('#p-body').innerHTML = list.length ? `<div class="card card-flush"><div class="table-wrap"><table class="table table-hover table-cards"><thead><tr><th>N°</th><th>Proveedor</th><th class="c">Estado</th><th class="r">Total</th><th class="r">Saldo</th><th></th></tr></thead><tbody>${list.map((o) => `<tr data-id="${o.id}" style="cursor:pointer"><td><b>${esc(o.number)}</b><div class="t-sub">${fmtDate(o.date)}${o.invoiceNo ? ` · Fact. ${esc(o.invoiceNo)}` : ''}</div></td><td>${esc(o.supplierName || '—')}<div class="t-sub">${(o.items || []).length} producto(s)</div></td><td class="c"><span class="badge badge-${ST[o.status]?.[1] || 'neutral'}">${ST[o.status]?.[0] || o.status}</span></td><td class="r num">${usd(o.total || 0)}</td><td class="r num ${(o.balance || 0) > 0 ? 'text-danger' : ''}">${(o.balance || 0) > 0 ? usd(o.balance) : '—'}</td><td class="r">${o.status === 'pedido' ? `<button class="btn btn-primary btn-sm" data-rc="${o.id}">${icon('truck')} Recibir</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
      : emptyState('truck', 'Sin órdenes de compra', 'Crea una desde el sugerido de compra o recibe mercancía directamente.');
    el.querySelectorAll('[data-rc]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); receiveFrom = list.find((o) => o.id === b.dataset.rc); tab = 'recibir'; draw(); });
    el.querySelectorAll('tr[data-id]').forEach((r) => r.onclick = () => openOrder(list.find((o) => o.id === r.dataset.id)));
  }
  function openOrder(o) {
    const m = openModal({
      title: `${esc(o.number)} · ${esc(o.supplierName || '')}`, sub: `${fmtDateTime(o.date)}${o.receivedAt ? ` · recibida ${fmtDateTime(o.receivedAt)}` : ''}`, size: 'lg',
      body: `<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="r">Cajas</th><th>Lote / vence</th><th class="r">Costo</th><th class="r">Subtotal</th></tr></thead><tbody>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${i.boxes}</td><td class="small mono">${esc(i.lot || '—')}${i.exp ? ` · ${fmtDate(i.exp)}` : ''}</td><td class="r">${usd(i.cost)}</td><td class="r num">${usd(i.boxes * i.cost)}</td></tr>`).join('')}</tbody></table></div>
        <div class="between mt"><span>Total</span><b>${usd(o.total || 0)}</b></div>${o.status === 'recibida' ? `<div class="between small"><span>Pagado</span><b>${usd(o.paid || 0)}</b></div><div class="between small"><span>Saldo</span><b class="${o.balance > 0 ? 'text-danger' : ''}">${usd(o.balance || 0)}</b></div>${o.dueDate ? `<div class="small muted">Vence ${fmtDate(o.dueDate)}</div>` : ''}` : ''}`,
      footer: `${o.status === 'pedido' ? `<button class="btn btn-ghost text-danger" data-x>${icon('x')} Anular</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar al proveedor</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-pr>${icon('print')} Imprimir</button><button class="btn btn-primary" data-close>Cerrar</button>`
    });
    m.el.querySelector('[data-pr]').onclick = () => printOrder(o);
    m.el.querySelector('[data-wa]')?.addEventListener('click', () => sendOrder(o));
    m.el.querySelector('[data-x]')?.addEventListener('click', async () => { if (!(await confirmDialog({ title: 'Anular orden', message: 'La orden queda anulada.', confirmText: 'Anular', danger: true }))) return; await cancelPurchaseOrder(o); m.close(); toast('Orden anulada', 'warning'); draw(); });
  }
  function printOrder(o) {
    const s = store.settings;
    printDoc(`Orden de compra ${o.number}`, `<p><b>${esc(store.businessName)}</b>${s.rif ? ` · ${esc(s.rif)}` : ''}<br>${esc(s.address || '')}<br>Proveedor: <b>${esc(o.supplierName || '')}</b> · Fecha: ${fmtDate(o.date)}</p><table><thead><tr><th>Producto</th><th>Presentación</th><th>Cajas</th><th class="r">Costo</th><th class="r">Subtotal</th></tr></thead><tbody>${(o.items || []).map((i) => { const p = store.product(i.productId); return `<tr><td>${esc(i.name)}</td><td>${p ? esc(productLine(p)) : ''}</td><td>${i.boxes}</td><td class="r">${usd(i.cost)}</td><td class="r">${usd(i.boxes * i.cost)}</td></tr>`; }).join('')}</tbody></table><p class="r"><b>Total: ${usd(o.total || 0)}</b></p><div class="sign"><div>Elaborado por</div><div>Recibido por</div></div>`);
  }
  function sendOrder(o) {
    const sup = store.supplier(o.supplierId);
    const t = `Hola${sup?.contact ? ' ' + sup.contact.split(' ')[0] : ''}, le escribimos de *${store.businessName}*. Le enviamos nuestro pedido *${o.number}*:\n\n${(o.items || []).map((i) => `• ${i.boxes} × ${i.name}`).join('\n')}\n\nQuedamos atentos a la confirmación y la fecha de entrega. ¡Gracias!`;
    window.open(sup?.phone ? waLink(sup.phone, t) : 'https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
  }

  // ---------------- RECIBIR ----------------
  function recibir() {
    const o = receiveFrom;
    const lines = (o?.items || []).map((i) => ({ productId: i.productId, boxes: i.boxes, cost: i.cost, lot: '', exp: '', price: '' }));
    let supplierId = o?.supplierId || '';
    $('#p-body').innerHTML = `<div class="card">
      <div class="card-head"><div class="card-title">${icon('truck')} ${o ? `Recibir ${esc(o.number)}` : 'Recibir mercancía'}</div>${o ? `<button class="btn btn-ghost btn-sm" id="r-noorder">Recibir sin orden</button>` : ''}</div>
      <div class="form-grid">
        <div class="field"><label>Proveedor</label><select class="select" id="r-sup"><option value="">—</option>${store.suppliers.map((s) => `<option value="${s.id}" ${supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>N° de factura del proveedor</label><input class="input" id="r-inv"></div>
      </div>
      <div class="section-title mt">Productos recibidos</div>
      <label class="search mt-xs">${icon('barcode')}<input id="r-q" placeholder="Escanea o busca el producto para agregarlo…" autocomplete="off"></label>
      <div class="pick-list" id="r-pick"></div>
      <div id="r-lines" class="mt"></div>
      <div class="form-grid mt">
        <div class="field"><label>Pagado ahora</label><input class="input" id="r-paid" inputmode="decimal" placeholder="0 = a crédito"></div>
        <div class="field"><label>Vencimiento de la factura</label><input class="input" type="date" id="r-due"><span class="hint">Si queda saldo. Vacío = según los días de crédito del proveedor.</span></div>
      </div>
      <label class="check mt-xs"><input type="checkbox" id="r-cash"> <span>El pago sale de la caja abierta</span></label>
      <div class="error-msg mt" id="r-err"></div>
      <div class="between mt"><b>Total factura: <span id="r-tot">${usd(0)}</span></b><button class="btn btn-success btn-lg" id="r-ok">${icon('check')} Ingresar al inventario</button></div>
    </div>`;
    const paintLines = () => {
      $('#r-lines').innerHTML = lines.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th style="width:80px">Cajas</th><th style="width:110px">Costo caja</th><th style="width:130px">Lote</th><th style="width:150px">Vencimiento</th><th style="width:110px">Nuevo PVP</th><th></th></tr></thead><tbody>${lines.map((l, i) => { const p = store.product(l.productId); return `<tr><td><b>${esc(p?.name || '')}</b> ${rxBadge(p, true)}<div class="t-sub">${esc(productLine(p || {}))} · PVP ${usd(p?.price || 0)}</div></td>
        <td><input class="input input-sm" data-f="boxes" data-i="${i}" inputmode="numeric" value="${l.boxes || ''}"></td><td><input class="input input-sm" data-f="cost" data-i="${i}" inputmode="decimal" value="${l.cost ? num(l.cost) : ''}"></td>
        <td><input class="input input-sm" data-f="lot" data-i="${i}" value="${esc(l.lot)}" placeholder="${p?.rx === 'controlado' ? 'Obligatorio' : ''}"></td><td><input class="input input-sm" type="date" data-f="exp" data-i="${i}" value="${l.exp}"></td>
        <td><input class="input input-sm" data-f="price" data-i="${i}" inputmode="decimal" value="${l.price}" placeholder="igual"></td><td><button class="btn btn-ghost btn-icon btn-sm" data-rm="${i}">${icon('x')}</button></td></tr>`; }).join('')}</tbody></table></div>`
        : `<div class="small muted">Agrega los productos de la factura. Registra el lote y el vencimiento de cada uno: así SanoFarmacia te avisa antes de que venzan.</div>`;
      el.querySelectorAll('#r-lines [data-f]').forEach((inp) => inp.oninput = () => { const l = lines[+inp.dataset.i]; const f = inp.dataset.f; l[f] = ['boxes', 'cost', 'price'].includes(f) ? parseNum(inp.value) : inp.value; tot(); });
      el.querySelectorAll('#r-lines [data-rm]').forEach((b) => b.onclick = () => { lines.splice(+b.dataset.rm, 1); paintLines(); });
      tot();
    };
    const tot = () => { $('#r-tot').textContent = usd(lines.reduce((a, l) => a + (Number(l.boxes) || 0) * (Number(l.cost) || 0), 0)); };
    const addP = (p) => { if (!p) return; if (!lines.some((l) => l.productId === p.id)) lines.push({ productId: p.id, boxes: 1, cost: Number(p.lastCost || p.cost) || 0, lot: '', exp: '', price: '' }); $('#r-q').value = ''; $('#r-pick').innerHTML = ''; paintLines(); };
    $('#r-q').oninput = debounce((e) => {
      const t = normalize(e.target.value);
      if (!t) { $('#r-pick').innerHTML = ''; return; }
      const L = store.products.filter((p) => searchText(p).includes(t)).slice(0, 8);
      $('#r-pick').innerHTML = L.map((p) => `<button class="list-item" data-ap="${p.id}"><div class="grow"><b>${esc(p.name)}</b><div class="t-sub">${esc(productLine(p))} · hay ${stockText(p)}</div></div></button>`).join('') + `<button class="list-item" data-newp>${icon('plus')}<div class="grow"><b>Crear producto nuevo</b><div class="t-sub">“${esc(e.target.value)}”</div></div></button>`;
      el.querySelectorAll('[data-ap]').forEach((b) => b.onclick = () => addP(store.product(b.dataset.ap)));
      el.querySelector('[data-newp]').onclick = async () => { const n = await productForm(null, { name: e.target.value }); if (n) setTimeout(() => addP(store.product(n.id) || n), 400); };
    }, 120);
    $('#r-q').onkeydown = (e) => { if (e.key === 'Enter') { const p = store.byBarcode(e.target.value); if (p) addP(p); } };
    $('#r-sup').onchange = (e) => { supplierId = e.target.value; };
    $('#r-noorder')?.addEventListener('click', () => { receiveFrom = null; recibir(); });
    $('#r-ok').onclick = async (e) => {
      $('#r-err').textContent = '';
      const btn = e.currentTarget; setBusy(btn, true, 'Ingresando…');
      try {
        const r = await receivePurchase({ order: o, supplierId: supplierId || null, invoiceNo: $('#r-inv').value, items: lines, paid: parseNum($('#r-paid').value), payFromCash: $('#r-cash').checked, dueDate: $('#r-due').value });
        toast(`Mercancía ingresada (${r.number})${r.balance > 0 ? ` · saldo ${usd(r.balance)}` : ''}`);
        receiveFrom = null; tab = 'ordenes'; draw();
      } catch (ex) { $('#r-err').textContent = ex.message; setBusy(btn, false); }
    };
    paintLines();
  }

  // ---------------- PROVEEDORES ----------------
  function proveedores() {
    $('#p-body').innerHTML = `<div class="between"><div class="small muted">Droguerías, laboratorios y distribuidores.</div><button class="btn btn-primary btn-sm" id="v-new">${icon('plus')} Nuevo proveedor</button></div>
      ${store.suppliers.length ? `<div class="grid-cards mt">${store.suppliers.map((s) => { const debt = store.payables.filter((p) => p.supplierId === s.id).reduce((a, p) => a + (p.balance || 0), 0); const n = store.products.filter((p) => p.supplierId === s.id).length; return `<div class="card"><div class="between"><b>${esc(s.name)}</b>${debt > 0 ? `<span class="badge badge-danger">debe ${usd(debt)}</span>` : ''}</div><div class="t-sub">${esc(s.rif || '')}${s.contact ? ' · ' + esc(s.contact) : ''}</div><div class="small mt-xs">${s.phone ? `${icon('phone')} ${esc(s.phone)} · ` : ''}crédito ${s.days || 0} días · ${n} producto(s)</div><div class="row mt" style="gap:6px"><button class="btn btn-ghost btn-sm" data-ed="${s.id}">${icon('edit')} Editar</button>${s.phone ? `<a class="btn btn-whatsapp btn-sm" href="${waLink(s.phone, `Hola, le escribimos de ${store.businessName}.`)}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}</div></div>`; }).join('')}</div>`
        : emptyState('truck', 'Sin proveedores', 'Registra tus droguerías para pedirles y llevar sus facturas por pagar.')}`;
    $('#v-new').onclick = async () => { if (await supplierForm()) draw(); };
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = async () => { if (await supplierForm(store.supplier(b.dataset.ed))) draw(); });
  }

  // ---------------- POR PAGAR ----------------
  function pagar() {
    const list = store.payables;
    const t = todayKey();
    $('#p-body').innerHTML = list.length ? `<div class="kpis kpis-sm"><div class="card kpi"><div class="kpi-label">Total por pagar</div><div class="kpi-value">${usd(store.totalPayable)}</div></div><div class="card kpi"><div class="kpi-label">Vencido</div><div class="kpi-value text-danger">${usd(list.filter((p) => p.dueDate && p.dueDate < t).reduce((a, p) => a + p.balance, 0))}</div></div><div class="card kpi"><div class="kpi-label">Vence en 7 días</div><div class="kpi-value">${usd(list.filter((p) => p.dueDate && p.dueDate >= t && p.dueDate <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).reduce((a, p) => a + p.balance, 0))}</div></div></div>
      <div class="card card-flush mt"><div class="table-wrap"><table class="table table-cards"><thead><tr><th>Factura</th><th>Proveedor</th><th>Vence</th><th class="r">Total</th><th class="r">Saldo</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td><b>${esc(p.number)}</b><div class="t-sub">${p.invoiceNo ? `Fact. ${esc(p.invoiceNo)} · ` : ''}${fmtDate(p.receivedAt || p.date)}</div></td><td>${esc(p.supplierName)}</td><td>${p.dueDate ? `${fmtDate(p.dueDate)} ${p.dueDate < t ? '<span class="badge badge-danger">vencida</span>' : p.dueDate === t ? '<span class="badge badge-warning">hoy</span>' : ''}` : '—'}</td><td class="r num">${usd(p.total)}</td><td class="r num"><b class="text-danger">${usd(p.balance)}</b></td><td class="r"><button class="btn btn-primary btn-sm" data-pay="${p.id}">${icon('dollar')} Abonar</button></td></tr>`).join('')}</tbody></table></div></div>`
      : emptyState('checkCircle', 'Nada por pagar', 'Las facturas recibidas a crédito aparecen aquí con su fecha de vencimiento.');
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payModal(list.find((p) => p.id === b.dataset.pay)));
  }
  function payModal(pu) {
    const m = openModal({
      title: 'Abonar a proveedor', sub: `${esc(pu.supplierName)} · ${esc(pu.number)} · saldo ${usd(pu.balance)}`, size: 'sm',
      body: `<div class="stack"><div class="field"><label>Monto</label><input class="input input-lg" data-a inputmode="decimal" value="${num(pu.balance)}" autofocus></div><div class="field"><label>Nota</label><input class="input" data-n placeholder="Transferencia, referencia…"></div><label class="check"><input type="checkbox" data-c> <span>Sale de la caja abierta</span></label><div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Registrar abono</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try { await payPurchase(pu, { amount: parseNum(m.el.querySelector('[data-a]').value), fromCash: m.el.querySelector('[data-c]').checked, note: m.el.querySelector('[data-n]').value }); m.close(); toast('Abono registrado'); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; if (tab !== 'recibir') receiveFrom = null; draw(); });
  $('#p-rec').onclick = () => { receiveFrom = null; tab = 'recibir'; draw(); };
  draw();
  const off = store.on('*', (evt) => { if (evt === 'payables' || evt === 'suppliers') { head(); if (tab === 'pagar' || tab === 'proveedores') draw(); } if (evt === 'products' && tab === 'sugerido') { head(); } });
  return () => off();
}

export function supplierForm(s = null) {
  return new Promise((resolve) => {
    let saved = null;
    const m = openModal({
      title: s ? 'Editar proveedor' : 'Nuevo proveedor', size: 'md',
      body: `<form class="form-grid" data-f>
        <div class="field full"><label>Nombre / razón social *</label><input class="input" name="name" value="${esc(s?.name || '')}" autofocus></div>
        <div class="field"><label>RIF / NIT / RUC</label><input class="input" name="rif" value="${esc(s?.rif || '')}"></div>
        <div class="field"><label>Vendedor / contacto</label><input class="input" name="contact" value="${esc(s?.contact || '')}"></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" value="${esc(s?.phone || '')}"></div>
        <div class="field"><label>Correo</label><input class="input" name="email" value="${esc(s?.email || '')}"></div>
        <div class="field"><label>Días de crédito</label><input class="input" name="days" inputmode="numeric" value="${s?.days ?? 30}"></div>
        <div class="field full"><label>Notas</label><input class="input" name="notes" value="${esc(s?.notes || '')}" placeholder="Días de visita, pedido mínimo…"></div>
        <div class="error-msg full" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try { saved = await saveSupplier({ name: F.name.value, rif: F.rif.value, contact: F.contact.value, phone: F.phone.value, email: F.email.value, days: F.days.value, notes: F.notes.value }, s?.id || null); m.close(); toast('Proveedor guardado'); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}
