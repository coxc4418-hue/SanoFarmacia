// SanoFarmacia — Recompras y fidelidad: tratamientos por acabarse, convenios por cobrar, saldos, cumpleaños y puntos
import { store } from '../store.js';
import { markRefillNotified, settleAgreement } from '../ops.js';
import { esc, usd, emptyState, fmtDate, toast, openModal, setBusy, confirmDialog, PAY_METHODS, methodLabel } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, openClient, payDebtModal } from '../client.js';
import { waClient, printDoc } from '../shared.js';
import { stockText, upb } from '../pharma.js';

const TABS = { recompras: 'Recompras', convenios: 'Convenios por cobrar', saldos: 'Saldos pendientes', cumples: 'Cumpleaños', puntos: 'Puntos' };

export function mount(el, { navigate, params = {} }) {
  let tab = TABS[params.tab] ? params.tab : 'recompras';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Recompras y fidelidad</h1><p class="view-sub">El paciente crónico es el que más compra: avísale antes de que se le acabe su medicina y no se irá a otra farmacia.</p></div></div>
    <div class="tabs" id="l-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}<span class="tab-n" data-n="${k}" hidden></span></button>`).join('')}</div>
    <div id="l-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  const set = (k, n) => { const b = el.querySelector(`[data-n="${k}"]`); if (b) { b.hidden = !n; b.textContent = n; } };

  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    set('recompras', store.dueRefills.length); set('saldos', store.debtors.length); set('cumples', store.birthdaysWithin(7).length);
    ({ recompras, convenios, saldos, cumples, puntos })[tab]();
  }

  function recompras() {
    const list = store.dueRefills;
    const all = []; for (const c of store.liveClients) for (const t of store.treatmentsOf(c)) all.push({ c, t, d: store.refillIn(t) });
    const next7 = all.filter((x) => x.d != null && x.d > (Number(store.settings.refillNoticeDays) || 3) && x.d <= 10).sort((a, b) => a.d - b.d);
    const row = ({ c, t, d }) => { const p = t.productId ? store.product(t.productId) : null; const ok = p && (Number(p.stock) || 0) >= upb(p); return `<div class="list-item">${avatar(c)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${icon('pill')} ${esc(t.name)}${t.note ? ' · ' + esc(t.note) : ''}</div><div class="small">${d < 0 ? `<span class="badge badge-danger">se le acabó hace ${-d} d</span>` : d === 0 ? '<span class="badge badge-warning">se le acaba hoy</span>' : `<span class="badge badge-${d <= 3 ? 'warning' : 'info'}">le quedan ${d} d · ${fmtDate(t.nextAt)}</span>`}${t.notifiedAt ? ` <span class="badge badge-success">${icon('check')} avisado ${fmtDate(t.notifiedAt)}</span>` : ''}${p ? ` <span class="t-sub">${ok ? `hay ${stockText(p)}` : '<b class="text-danger">sin existencia: pídela</b>'}</span>` : ''}</div></div>
      <div class="row" style="gap:4px">${c.phone ? `<button class="btn btn-whatsapp btn-sm" data-wa="${c.id}" data-t="${t.id}">${icon('whatsapp')}<span class="hide-sm"> Avisar</span></button>` : ''}<button class="btn btn-primary btn-sm" data-sell="${c.id}" title="Vender ahora">${icon('cart')}</button></div></div>`; };
    $('#l-body').innerHTML = `<div class="grid-2">
      <div class="card"><div class="card-head"><div class="card-title">${icon('bell')} Para avisar hoy</div><span class="small muted">${list.length}</span></div>${list.length ? `<div class="list">${list.map(row).join('')}</div>` : emptyState('checkCircle', 'Nadie por avisar hoy', 'Registra los tratamientos continuos en la ficha de cada paciente (hipertensión, diabetes, tiroides…).')}</div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('calendar')} Próximos días</div><span class="small muted">${next7.length}</span></div>${next7.length ? `<div class="list">${next7.map(row).join('')}</div>` : emptyState('calendar', 'Sin recompras próximas')}</div>
    </div>
    <div class="card mt"><div class="small muted">${icon('info')} La fecha de recompra se calcula sola: cada vez que el paciente compra su medicina, se suma lo que le dura según las unidades que toma al día. Ajusta los días de aviso en Configuración → Fidelidad.</div></div>`;
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => navigate('vender', { clientId: b.dataset.sell }));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = async () => { const c = store.client(b.dataset.wa); const t = (c.treatments || []).find((x) => x.id === b.dataset.t); waClient('recompra', { client: c, treatment: t }); await markRefillNotified(c, t.id); });
  }

  async function convenios() {
    $('#l-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    let sales = [];
    try { sales = await store.agreementSales(); } catch (e) { console.error(e); }
    if (tab !== 'convenios') return;
    const pending = sales.filter((s) => !s.agreementPaid);
    const by = {};
    for (const s of pending) (by[s.agreementId || '?'] ||= []).push(s);
    const ags = Object.entries(by);
    $('#l-body').innerHTML = !store.settings.agreements.length ? emptyState('handshake', 'Sin convenios', 'Crea convenios con seguros, empresas o caja de ahorro en Configuración → Convenios: descuento y porcentaje que cubre el convenio.')
      : ags.length ? ags.map(([id, L]) => { const ag = store.agreement(id); const tot = L.reduce((a, s) => a + (s.agreementDue || 0), 0); return `<div class="card mt"><div class="card-head"><div class="card-title">${icon('handshake')} ${esc(ag?.name || L[0].agreementName || 'Convenio')}</div><div class="row" style="gap:6px"><b>${usd(tot)}</b><button class="btn btn-secondary btn-sm" data-pr="${id}">${icon('print')} Relación</button><button class="btn btn-primary btn-sm" data-st="${id}">${icon('check')} Marcar cobrado</button></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Factura</th><th>Fecha</th><th>Paciente</th><th class="r">Total</th><th class="r">Cubre el convenio</th></tr></thead><tbody>${L.map((s) => `<tr><td><b>${esc(s.number)}</b></td><td>${fmtDate(s.date)}</td><td>${esc(s.memberName || '')}<div class="t-sub">${esc(s.memberIdDoc || '')}</div></td><td class="r num">${usd(s.total)}</td><td class="r num"><b>${usd(s.agreementDue)}</b></td></tr>`).join('')}</tbody></table></div></div>`; }).join('')
        : emptyState('checkCircle', 'Todo cobrado', 'No hay montos pendientes por cobrar a convenios.');
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { const L = by[b.dataset.pr]; const ag = store.agreement(b.dataset.pr); printDoc(`Relación de cobro · ${ag?.name || ''}`, `<p>${esc(store.businessName)}${store.settings.rif ? ' · ' + esc(store.settings.rif) : ''}</p><table><thead><tr><th>Factura</th><th>Fecha</th><th>Paciente</th><th>Documento</th><th>N° afiliado</th><th class="r">Monto</th></tr></thead><tbody>${L.map((s) => { const c = store.client(s.memberId); return `<tr><td>${esc(s.number)}</td><td>${fmtDate(s.date)}</td><td>${esc(s.memberName || '')}</td><td>${esc(s.memberIdDoc || '')}</td><td>${esc(c?.agreementNumber || '')}</td><td class="r">${usd(s.agreementDue)}</td></tr>`; }).join('')}</tbody></table><p class="r"><b>Total: ${usd(L.reduce((a, s) => a + s.agreementDue, 0))}</b></p><div class="sign"><div>Farmacia</div><div>Convenio</div></div>`); });
    el.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
      const L = by[b.dataset.st];
      const m = openModal({ title: 'Cobro del convenio', sub: `${L.length} factura(s) · ${usd(L.reduce((a, s) => a + s.agreementDue, 0))}`, size: 'sm', body: `<div class="stack"><div class="field"><label>Forma de pago</label><select class="select" data-m>${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div><div class="field"><label>Referencia</label><input class="input" data-n></div></div>`, footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Confirmar</button>` });
      m.el.querySelector('[data-ok]').onclick = async (e) => { setBusy(e.currentTarget, true); await settleAgreement(L, { method: m.el.querySelector('[data-m]').value, note: m.el.querySelector('[data-n]').value }); m.close(); toast('Convenio marcado como cobrado'); convenios(); };
    });
  }

  function saldos() {
    const list = store.debtors;
    $('#l-body').innerHTML = list.length ? `<div class="card"><div class="card-head"><div class="card-title">${icon('wallet')} Pacientes con saldo</div><b>${usd(store.totalDebt)}</b></div><div class="list">${list.map((c) => `<div class="list-item">${avatar(c)}<div class="grow" style="min-width:0"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${esc(c.phone || '')}</div></div><b class="text-danger num">${usd(c.balance)}</b>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${c.id}">${icon('whatsapp')}</button>` : ''}<button class="btn btn-primary btn-sm" data-pay="${c.id}">${icon('dollar')} Cobrar</button></div>`).join('')}</div></div>`
      : emptyState('checkCircle', 'Nadie debe', 'Las ventas a crédito quedan aquí para cobrarlas después.');
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waClient('deuda', { client: store.client(b.dataset.wa) }));
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payDebtModal(store.client(b.dataset.pay)));
  }

  function cumples() {
    const list = store.birthdaysWithin(30);
    $('#l-body').innerHTML = list.length ? `<div class="card"><div class="list">${list.map((c) => `<div class="list-item">${avatar(c)}<div class="grow"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${c.inDays === 0 ? '🎂 ¡Hoy!' : `en ${c.inDays} día(s) · ${fmtDate(c.birthDate.replace(/^\d{4}/, String(new Date().getFullYear())))}`}</div></div>${c.phone ? `<button class="btn btn-whatsapp btn-sm" data-wa="${c.id}">${icon('whatsapp')} Felicitar</button>` : ''}</div>`).join('')}</div></div>`
      : emptyState('cake', 'Sin cumpleaños en los próximos 30 días', 'Registra la fecha de nacimiento en la ficha del paciente.');
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waClient('cumple', { client: store.client(b.dataset.wa) }));
  }

  function puntos() {
    const L = store.loyalty;
    const list = store.liveClients.filter((c) => Number(c.points) > 0).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 100);
    $('#l-body').innerHTML = `<div class="card"><div class="small">${L.enabled ? `Programa activo: <b>1 punto por cada ${usd(L.per)}</b> de compra · cada punto vale <b>${usd(L.pointValue)}</b> · canje desde <b>${L.minRedeem} pts</b>.` : 'El programa de puntos está apagado.'} <button class="linkish" id="l-cfg">Configurar</button></div></div>
      ${list.length ? `<div class="card mt"><div class="list">${list.map((c) => `<div class="list-item">${avatar(c)}<div class="grow"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${c.visits || 0} compra(s)</div></div><span class="badge badge-violet">${icon('star')} ${Math.floor(c.points)} pts · ${usd(Math.floor(c.points) * L.pointValue)}</span>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${c.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div></div>` : emptyState('star', 'Aún nadie tiene puntos', 'Se suman solos al vender a un paciente registrado.')}`;
    $('#l-cfg').onclick = () => navigate('ajustes', { tab: 'fidelidad' });
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waClient('puntos', { client: store.client(b.dataset.wa) }));
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  draw();
  const off = store.on('clients', () => { if (tab !== 'convenios') draw(); });
  return () => off();
}
