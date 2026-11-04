// SanoFarmacia — Inicio: el día de la farmacia de un vistazo
import { store, orderBadge } from '../store.js';
import { esc, usd, fmtLongDate, todayKey, emptyState, fmtAgo, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, openClient, measureForm, clientForm } from '../client.js';
import { waClient } from '../shared.js';
import { expBadge, stockText, productLine } from '../pharma.js';
import { markRefillNotified } from '../ops.js';

export function mount(el, { navigate }) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">${hello} ${h < 12 ? '☀️' : h < 19 ? '💊' : '🌙'}</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
      <div class="view-actions" data-tour="quick">
        <button class="btn btn-primary" data-q="sell">${icon('cart')} Vender <kbd class="hide-sm">F1</kbd></button>
        <button class="btn btn-secondary" data-q="buy">${icon('truck')} Recibir compra</button>
        <button class="btn btn-secondary" data-q="ms">${icon('pulse')} Control de salud</button>
        <button class="btn btn-ghost" data-q="new">${icon('userPlus')} Paciente</button>
      </div></div>
    <div id="d-ord"></div>
    <div class="kpis" data-tour="kpis" id="d-kpis"></div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="expiry"><div class="card-head"><div class="card-title">${icon('calendar')} Vencimientos próximos</div><button class="btn btn-ghost btn-sm" data-go="inventario">Inventario</button></div><div id="d-exp"></div></div>
      <div class="card" data-tour="follow"><div class="card-head"><div class="card-title">${icon('heart')} Recompras para avisar hoy</div><button class="btn btn-ghost btn-sm" data-go="fidelizar">Ver todo</button></div><div id="d-follow"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="low"><div class="card-head"><div class="card-title">${icon('alert')} Por reponer</div><button class="btn btn-ghost btn-sm" data-go="compras">Hacer pedido</button></div><div id="d-low"></div></div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('trend')} Más vendidos (7 días)</div><button class="btn btn-ghost btn-sm" data-go="reportes">Reportes</button></div><div id="d-top"></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
  $('[data-q="sell"]').onclick = () => navigate('vender');
  $('[data-q="buy"]').onclick = () => navigate('compras', { tab: 'recibir' });
  $('[data-q="ms"]').onclick = () => measureForm();
  $('[data-q="new"]').onclick = async () => { const c = await clientForm(); if (c) openClient(c.id); };

  function orders() {
    const list = store.pendingOrders;
    const fresh = store.newOrders;
    $('#d-ord').innerHTML = list.length ? `<div class="banner req-banner"><span>${icon('bag')} <b>${list.length} pedido(s) en línea</b> por atender${fresh.length ? ` · ${fresh.length} nuevo(s)` : ''}: ${list.slice(0, 3).map((o) => `${esc((o.name || '').split(' ')[0])} (${o.items?.length || 0})`).join(', ')}</span><button class="btn btn-sm btn-primary" id="d-ord-go">Atender</button></div>` : '';
    $('#d-ord-go')?.addEventListener('click', () => navigate('pedidos'));
  }

  function kpis() {
    const t = todayKey();
    const sales = store.recentSales.filter((s) => s.dayKey === t && s.status !== 'voided' && s.kind !== 'abono');
    const total = sales.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const margin = sales.reduce((a, s) => a + (Number(s.total) || 0) - (Number(s.cost) || 0), 0);
    const low = store.lowProducts.length; const out = store.outProducts.length;
    const expd = store.expiredLots.length; const exp = store.expiringProducts.length;
    const due = store.dueRefills.length;
    const pay = store.totalPayable;
    const overdue = store.payables.filter((p) => p.dueDate && p.dueDate <= t).length;
    $('#d-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ventas de hoy</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(total)}</div><div class="kpi-sub">${sales.length} venta(s)${sales.length ? ` · ticket ${usd(total / sales.length)}` : ''}${store.openShift ? '' : ' · <span class="text-warning">caja cerrada</span>'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta hoy</span><span class="kpi-icon tone-brand">${icon('trend')}</span></div><div class="kpi-value">${usd(margin)}</div><div class="kpi-sub">${total ? `margen ${Math.round(margin / total * 100)}%` : 'sobre el costo de lo vendido'}</div></div>
      <div class="card kpi kpi-link" data-go2="inventario" data-p="bajo"><div class="kpi-top"><span class="kpi-label">Stock bajo</span><span class="kpi-icon tone-warning">${icon('box')}</span></div><div class="kpi-value">${low}</div><div class="kpi-sub">${out ? `<span class="text-danger">${out} agotado(s)</span>` : 'ninguno agotado'}</div></div>
      <div class="card kpi kpi-link" data-go2="inventario" data-p="vencimientos"><div class="kpi-top"><span class="kpi-label">Por vencer</span><span class="kpi-icon tone-danger">${icon('calendar')}</span></div><div class="kpi-value">${exp}</div><div class="kpi-sub">${expd ? `<span class="text-danger">${expd} lote(s) vencido(s)</span>` : `en ${store.settings.expiryAlertDays || 90} días`}</div></div>
      <div class="card kpi kpi-link" data-go2="fidelizar"><div class="kpi-top"><span class="kpi-label">Recompras</span><span class="kpi-icon tone-violet">${icon('pill')}</span></div><div class="kpi-value">${due}</div><div class="kpi-sub">tratamientos por acabarse</div></div>
      <div class="card kpi kpi-link" data-go2="compras" data-p="pagar"><div class="kpi-top"><span class="kpi-label">Por pagar</span><span class="kpi-icon tone-info">${icon('truck')}</span></div><div class="kpi-value">${usd(pay)}</div><div class="kpi-sub">${overdue ? `<span class="text-danger">${overdue} factura(s) vencida(s)</span>` : 'a proveedores'}</div></div>`;
    el.querySelectorAll('[data-go2]').forEach((b) => b.onclick = () => navigate(b.dataset.go2, b.dataset.p ? { tab: b.dataset.p } : {}));
  }

  function expiry() {
    const list = store.expiringLots(Math.max(30, Number(store.settings.expiryAlertDays) || 90)).slice(0, 7);
    $('#d-exp').innerHTML = list.length ? `<div class="list">${list.map((l) => `<div class="list-item"><span class="kpi-icon tone-${l.exp < todayKey() ? 'danger' : 'warning'}" style="width:36px;height:36px">${icon('pill')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(l.p.name)}</b><div class="t-sub">Lote ${esc(l.lot || 's/l')} · ${stockText(l.p, l.qty)} · vence ${fmtDate(l.exp)}</div></div>${expBadge(l.exp)}</div>`).join('')}</div>`
      : emptyState('checkCircle', 'Sin vencimientos cercanos', 'Ningún lote vence en los próximos días.');
  }

  function follow() {
    const due = store.dueRefills.slice(0, 6);
    const bd = store.birthdaysToday;
    $('#d-follow').innerHTML = `
      <div class="follow-sums"><div><b>${store.dueRefills.length}</b><span>recompras</span></div><div><b>${store.dueRefills.filter((x) => x.d < 0).length}</b><span>ya sin medicina</span></div><div><b>${store.debtors.length}</b><span>con saldo</span></div><div><b>${store.birthdaysWithin(7).length}</b><span>cumpleaños (7 d)</span></div></div>
      ${due.length ? `<div class="list mt">${due.map(({ c, t, d }) => `<div class="list-item">${avatar(c)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${esc(t.name)} · ${d < 0 ? `<span class="text-danger">se le acabó hace ${-d} d</span>` : d === 0 ? 'se le acaba hoy' : `le quedan ${d} d`}${t.notifiedAt ? ' · avisado' : ''}</div></div>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${c.id}" data-t="${t.id}" title="Avisar por WhatsApp">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${bd.length ? `<div class="section-title mt">${icon('cake')} Cumpleaños hoy</div><div class="list">${bd.map((c) => `<div class="list-item">${avatar(c)}<div class="grow"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button></div>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-bd="${c.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${!due.length && !bd.length ? emptyState('checkCircle', 'Todo al día', 'Registra los tratamientos continuos de tus pacientes y aquí verás a quién avisar.') : ''}`;
    el.querySelectorAll('#d-follow [data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('#d-follow [data-wa]').forEach((b) => b.onclick = () => { const c = store.client(b.dataset.wa); const t = (c.treatments || []).find((x) => x.id === b.dataset.t); waClient('recompra', { client: c, treatment: t }); markRefillNotified(c, t.id); });
    el.querySelectorAll('#d-follow [data-bd]').forEach((b) => b.onclick = () => waClient('cumple', { client: store.client(b.dataset.bd) }));
  }

  function low() {
    const list = store.lowProducts.sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0)).slice(0, 7);
    $('#d-low').innerHTML = list.length ? `<div class="list">${list.map((p) => `<div class="list-item"><span class="kpi-icon tone-${(Number(p.stock) || 0) <= 0 ? 'danger' : 'warning'}" style="width:36px;height:36px">${icon('box')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(productLine(p))}</div></div><div class="r"><b class="${(Number(p.stock) || 0) <= 0 ? 'text-danger' : ''}">${(Number(p.stock) || 0) <= 0 ? 'Agotado' : stockText(p)}</b><div class="t-sub">mín. ${stockText(p, p.minStock || 0)}</div></div></div>`).join('')}</div>`
      : emptyState('checkCircle', 'Inventario completo', 'Ningún producto por debajo del mínimo.');
  }

  function top() {
    const m = new Map();
    for (const s of store.recentSales) {
      if (s.status === 'voided') continue;
      for (const i of s.items || []) if (i.productId) { const r = m.get(i.productId) || { name: i.name, units: 0, total: 0 }; r.units += i.qty * (i.factor || 1); r.total += Number(i.total) || 0; m.set(i.productId, r); }
    }
    const list = [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
    const max = list[0]?.[1].total || 1;
    $('#d-top').innerHTML = list.length ? `<div class="stack" style="gap:10px">${list.map(([id, r]) => `<div><div class="between small"><b class="ellipsis">${esc(r.name)}</b><span class="num">${usd(r.total)}</span></div><div class="bar mt-xs"><span style="width:${Math.max(4, r.total / max * 100)}%"></span></div><div class="t-sub">${r.units} unidad(es)</div></div>`).join('')}</div>`
      : emptyState('chart', 'Aún sin ventas', 'Aquí verás tus productos estrella.');
  }

  const all = () => { orders(); kpis(); expiry(); follow(); low(); top(); };
  all();
  const off = store.on('*', (evt) => {
    if (evt === 'orders') orders();
    if (evt === 'products') { kpis(); expiry(); low(); }
    if (evt === 'clients') { kpis(); follow(); }
    if (evt === 'sales' || evt === 'shift' || evt === 'payables') { kpis(); top(); }
    if (evt === 'settings') all();
  });
  return () => off();
}
