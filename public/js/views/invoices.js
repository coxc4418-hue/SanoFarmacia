// SanoFarmacia — Facturación: ventas, recetas, convenios, créditos y abonos
import { store } from '../store.js';
import { voidSale } from '../ops.js';
import { requirePin } from '../auth.js';
import { esc, usd, bs, toast, openModal, emptyState, normalize, debounce, fmtDateTime, startOfDay, endOfDay, addDays, dayKey, fromKey, methodLabel, toCSV, download, setBusy, num, loc } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt } from '../shared.js';

const KIND = { venta: ['Ventas', 'badge-brand', 'cart'], abono: ['Abono / saldo', 'badge-info', 'dollar'] };
const EXTRA = { rx: ['Con receta', (s) => !!s.rxId], convenio: ['Con convenio', (s) => (s.agreementDue || 0) > 0 || (s.agreementDiscount || 0) > 0], credito: ['A crédito', (s) => (s.credit || 0) > 0], pedido: ['Pedidos en línea', (s) => !!s.orderId] };

export function mount(el, { params = {} } = {}) {
  let from = dayKey(addDays(new Date(), -6)); let to = dayKey();
  let kind = 'all'; let search = params.q || ''; let rows = null;
  if (params.q) from = dayKey(addDays(new Date(), -90));

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Facturación</h1><p class="view-sub">Todas las ventas con su detalle por lote, recetas, convenios, créditos y abonos.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="f-csv">${icon('download')} Exportar</button></div></div>
    <div class="kpis" id="f-kpis"></div>
    <div class="card card-flush"><div class="toolbar">
      <label class="search">${icon('search')}<input id="f-search" placeholder="Buscar por número, paciente, documento o producto…" value="${esc(search)}"></label>
      <div class="row"><input class="input input-sm" type="date" id="f-from" value="${from}" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="f-to" value="${to}" style="width:auto"></div>
    </div><div class="chips" id="f-chips" style="padding:0 14px 12px"></div><div id="f-list"><div class="empty"><div class="spinner"></div></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    $('#f-list').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try { rows = (await store.salesBetween(startOfDay(fromKey(from)).toISOString(), endOfDay(fromKey(to)).toISOString())).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
    catch (e) { rows = []; toast('No se pudo cargar: ' + e.message, 'danger'); }
    if (!$('#f-list')) return;
    render();
  }

  function render() {
    if (!rows) return;
    const valid = rows.filter((s) => s.status !== 'voided');
    const billed = valid.reduce((a, s) => a + s.total, 0);
    const received = valid.reduce((a, s) => a + (s.received || 0), 0);
    const profit = valid.reduce((a, s) => a + s.total - (s.cost || 0), 0);
    $('#f-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Facturado</span><span class="kpi-icon tone-brand">${icon('file')}</span></div><div class="kpi-value">${usd(billed)}</div><div class="kpi-sub">${valid.length} documento(s)</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(received)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta</span><span class="kpi-icon tone-violet">${icon('trend')}</span></div><div class="kpi-value">${usd(profit)}</div><div class="kpi-sub">facturado menos costo de productos</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Anulados</span><span class="kpi-icon tone-danger">${icon('x')}</span></div><div class="kpi-value">${rows.length - valid.length}</div><div class="kpi-sub">en el período</div></div>`;
    const counts = { all: rows.length }; Object.keys(KIND).forEach((k) => { counts[k] = rows.filter((s) => s.kind === k).length; }); Object.entries(EXTRA).forEach(([k, [, f]]) => { counts[k] = rows.filter(f).length; });
    $('#f-chips').innerHTML = [['all', 'Todos'], ...Object.entries(KIND).map(([k, v]) => [k, v[0]]), ...Object.entries(EXTRA).map(([k, v]) => [k, v[0]])].map(([k, l]) => `<button class="chip ${kind === k ? 'on' : ''}" data-k="${k}">${l} <span class="count">${counts[k] || 0}</span></button>`).join('');
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; render(); });
    const t = normalize(search);
    const list = rows.filter((s) => (kind === 'all' || s.kind === kind || (EXTRA[kind] && EXTRA[kind][1](s))) && (!t || normalize(`${s.number} ${s.memberName} ${s.memberNumber || ''} ${s.memberPhone || ''} ${s.memberIdDoc || ''} ${(s.items || []).map((i) => i.name).join(' ')}`).includes(t)));
    $('#f-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Documento</th><th>Fecha</th><th class="hide-sm">Cliente</th><th class="hide-sm">Detalle</th><th class="hide-sm">Pago</th><th class="r">Total</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}">
        <td><b>${esc(s.number)}</b><div><span class="badge ${KIND[s.kind]?.[1] || 'badge-neutral'}">${KIND[s.kind]?.[0] || s.kind}</span>${s.rxId ? ' <span class="badge badge-info">Rx</span>' : ''}${(s.credit || 0) > 0 ? ' <span class="badge badge-warning">Crédito</span>' : ''}${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}</div></td>
        <td class="small nowrap">${fmtDateTime(s.date)}</td>
        <td class="hide-sm">${esc(s.memberName || 'Cliente de mostrador')}${s.memberNumber ? `<div class="t-sub">${esc(s.memberNumber)}</div>` : ''}</td>
        <td class="hide-sm small ellipsis" style="max-width:260px">${(s.items || []).map((i) => esc(i.name)).join(', ')}</td>
        <td class="hide-sm small">${(s.payments || []).map((p) => esc(methodLabel(p.method))).join(', ') || '—'}</td>
        <td class="r num"><b>${usd(s.total)}</b></td>
        <td class="r nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-view="${s.id}" title="Ver">${icon('eye')}</button><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}" title="Imprimir">${icon('print')}</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyState('file', 'No hay documentos en este período')}</div>`;
    const find = (id) => rows.find((s) => s.id === id);
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(find(b.dataset.pr)));
    el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => view(find(b.dataset.view)));
  }

  function view(s) {
    const m = openModal({
      title: `${KIND[s.kind]?.[0] || ''} ${esc(s.number)}`, sub: `${fmtDateTime(s.date)} · ${esc(s.memberName || 'Cliente de mostrador')}${s.status === 'voided' ? ' · ANULADO' : ''}`, size: 'md',
      body: `<div class="stack">
        ${s.agreementName ? `<div class="box small">${icon('handshake')} Convenio <b>${esc(s.agreementName)}</b>${s.agreementDiscount ? ` · descuento ${usd(s.agreementDiscount)}` : ''}${s.agreementDue ? ` · cubre ${usd(s.agreementDue)} (${s.agreementPaid ? 'cobrado' : 'por cobrar'})` : ''}</div>` : ''}
        <div class="summary-box">${(s.items || []).map((i) => `<div class="summary-row"><span>${num(i.qty, i.qty % 1 ? 2 : 0)} × ${esc(i.name)}${i.detail ? ` <span class="t-sub">· ${esc(i.detail)}</span>` : ''}${i.lots ? `<div class="t-sub">Lote ${esc(i.lots)}</div>` : ''}</span><b>${usd(i.total ?? i.price * i.qty)}</b></div>`).join('')}
          ${s.discount ? `<div class="summary-row"><span>Descuentos${s.pointsUsed ? ` (incluye ${s.pointsUsed} pts)` : ''}</span><b>−${usd(s.discount)}</b></div>` : ''}${s.sellerName ? `<div class="summary-row"><span>Atendió</span><b>${esc(s.sellerName)}</b></div>` : ''}${(s.credit || 0) > 0 ? `<div class="summary-row"><span>Quedó a crédito</span><b>${usd(s.credit)}</b></div>` : ''}
          <div class="summary-row total"><span>Total</span><span>${usd(s.total)}</span></div>
</div>
        ${(s.payments || []).length ? `<div class="section-title">Pagos</div><div class="summary-box">${s.payments.map((p) => `<div class="summary-row"><span>${esc(methodLabel(p.method))}</span><b>${usd(p.amount)}</b></div>`).join('')}${s.changeUSD > 0.009 ? `<div class="summary-row"><span>Vuelto</span><b>${usd(s.changeUSD)}</b></div>` : ''}</div>` : ''}
        ${s.status === 'voided' ? `<div class="pay-status due"><span>Anulado ${fmtDateTime(s.voidedAt)}${s.voidReason ? ': ' + esc(s.voidReason) : ''}</span><span></span></div>` : ''}
      </div>`,
      footer: `${s.status !== 'voided' ? `<button class="btn btn-danger-soft" data-void style="margin-right:auto">${icon('x')} Anular</button>` : ''}<button class="btn btn-secondary" data-close>Cerrar</button><button class="btn btn-primary" data-pr>${icon('print')} Imprimir</button>`
    });
    m.el.querySelector('[data-pr]').onclick = () => printReceipt(s);
    m.el.querySelector('[data-void]') && (m.el.querySelector('[data-void]').onclick = async () => {
      if (!(await requirePin('Anular un documento'))) return;
      const m2 = openModal({
        title: `Anular ${esc(s.number)}`, size: 'sm',
        sub: s.kind === 'abono' ? 'El monto vuelve a ser saldo pendiente del paciente y se revierte el cobro de la caja.' : 'Se revierte el cobro de la caja; los productos regresan a su mismo lote, se descuentan los puntos y la receta queda anulada.',
        body: `<div class="field"><label>Motivo</label><input class="input" data-r placeholder="Ej.: error en el cobro" autofocus></div>`,
        footer: `<button class="btn btn-secondary" data-close>Volver</button><button class="btn btn-danger" data-ok>Anular</button>`
      });
      m2.el.querySelector('[data-ok]').onclick = async (e) => {
        setBusy(e.currentTarget, true);
        try {
          const { cashReverted } = await voidSale(s, m2.el.querySelector('[data-r]').value.trim());
          m2.close(); m.close(); toast(cashReverted ? 'Documento anulado y caja revertida' : 'Documento anulado (no hay caja abierta: ajusta el efectivo manualmente)', cashReverted ? 'success' : 'warning', 5000);
          load();
        } catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
      };
    });
  }

  $('#f-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  $('#f-from').onchange = (e) => { from = e.target.value; load(); };
  $('#f-to').onchange = (e) => { to = e.target.value; load(); };
  $('#f-csv').onclick = () => download(`facturacion-${from}-${to}.csv`, '﻿' + toCSV([['Número', 'Tipo', 'Fecha', 'Paciente', 'N° paciente', 'Documento', 'Detalle', 'Total', 'Cobrado', 'Costo', 'Moneda', 'Pago', 'Estado'],
    ...(rows || []).map((s) => [s.number, KIND[s.kind]?.[0], fmtDateTime(s.date), s.memberName, s.memberNumber || '', s.memberIdDoc || '', (s.items || []).map((i) => i.name).join(' + '), s.total.toFixed(2), (s.received || 0).toFixed(2), (s.cost || 0).toFixed(2), (s.payments?.[0]?.currency || loc().cur), (s.payments || []).map((p) => methodLabel(p.method)).join(' + '), s.status === 'voided' ? 'Anulado' : 'Válido'])]));
  load();
  return store.on('sales', () => load());
}
