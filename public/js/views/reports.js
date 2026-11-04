// SanoFarmacia — Reportes de la farmacia (protegidos con PIN)
import { store } from '../store.js';
import { methodNet } from '../ops.js';
import { esc, usd, num, emptyState, startOfDay, endOfDay, addDays, dayKey, fromKey, fmtDate, shortDate, methodLabel, toCSV, download } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';
import { upb, RX } from '../pharma.js';

const RANGES = { hoy: 'Hoy', 7: '7 días', 30: '30 días', mes: 'Este mes', anio: 'Este año', custom: 'Personalizado' };
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function mount(el) {
  let range = '30';
  let from = dayKey(addDays(new Date(), -29)); let to = dayKey();
  let data = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Ventas, ganancia, productos estrella, clasificación ABC, horas pico, recetas, convenios, mermas e inventario.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="r-csv">${icon('download')} Excel</button><button class="btn btn-secondary" id="r-print">${icon('print')} Imprimir</button></div></div>
    <div class="card" style="margin-bottom:16px;padding:12px 14px"><div class="row row-wrap"><div class="chips" id="r-ranges"></div><div class="row" id="r-custom" hidden><input class="input input-sm" type="date" id="r-from" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="r-to" style="width:auto"></div></div></div>
    <div id="r-body"><div class="empty"><div class="spinner"></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  function setRange(k) {
    range = k; const now = new Date();
    if (k === 'hoy') { from = to = dayKey(); }
    if (k === '7') { from = dayKey(addDays(now, -6)); to = dayKey(); }
    if (k === '30') { from = dayKey(addDays(now, -29)); to = dayKey(); }
    if (k === 'mes') { from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); to = dayKey(); }
    if (k === 'anio') { from = dayKey(new Date(now.getFullYear(), 0, 1)); to = dayKey(); }
    $('#r-ranges').innerHTML = Object.entries(RANGES).map(([v, l]) => `<button class="chip ${v === range ? 'on' : ''}" data-r="${v}">${l}</button>`).join('');
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => setRange(b.dataset.r));
    $('#r-custom').hidden = k !== 'custom';
    $('#r-from').value = from; $('#r-to').value = to;
    load();
  }

  async function load() {
    $('#r-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    const a = startOfDay(fromKey(from)).toISOString(), b = endOfDay(fromKey(to)).toISOString();
    try {
      const [sales, moves, logs, rx] = await Promise.all([
        store.salesBetween(a, b), store.listBetween('cash_movements', 'date', a, b), store.listBetween('inventory_logs', 'date', a, b), store.listBetween('prescriptions', 'date', a, b)
      ]);
      data = { sales: sales.filter((s) => s.status !== 'voided'), moves, logs, rx: rx.filter((r) => r.status !== 'anulada') };
    } catch (e) { if ($('#r-body')) $('#r-body').innerHTML = `<div class="card">${emptyState('alert', 'No se pudo cargar', esc(e.message))}</div>`; return; }
    if (!$('#r-body')) return;
    render();
  }

  const top = (map, n = 8) => Object.entries(map).sort((x, y) => y[1] - x[1]).slice(0, n);
  function hbars(rows, fmt = (v) => v, unit = '') {
    if (!rows.length) return emptyState('chart', 'Sin datos en el período');
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return rows.map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${fmt(v)}${unit}"><span class="ellipsis">${esc(k)}</span><div class="track"><i style="width:${Math.max(2, v / max * 100)}%"></i></div><b class="num">${fmt(v)}${unit}</b></div>`).join('');
  }
  const add = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };

  function compute() {
    const { sales, moves, logs, rx } = data;
    const ventas = sales.filter((s) => s.kind !== 'abono');
    const billed = ventas.reduce((a, s) => a + (s.total || 0), 0);
    const cash = sales.reduce((a, s) => a + (s.received || 0), 0);
    const cost = ventas.reduce((a, s) => a + (s.cost || 0), 0);
    const profit = billed - cost;
    const ticket = ventas.length ? billed / ventas.length : 0;
    const prodTotal = {}; const prodUnits = {}; const prodProfit = {}; const byCat = {}; const byLab = {}; const byRx = {}; const bySeller = {};
    const perDay = {}; const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const methods = {}; let credit = 0; let agreementDue = 0; let agreementDisc = 0; let pointsDisc = 0; let delivery = 0; let online = 0; let fractioned = 0;
    const clients = new Set();
    for (const s of ventas) {
      const d = new Date(s.date);
      add(perDay, s.dayKey || dayKey(d), s.total || 0);
      heat[d.getDay()][d.getHours()]++;
      if (s.memberId) clients.add(s.memberId);
      credit += s.credit || 0; agreementDue += s.agreementDue || 0; agreementDisc += s.agreementDiscount || 0; pointsDisc += s.pointsDiscount || 0;
      if (s.orderId) online++;
      if (s.sellerName) add(bySeller, s.sellerName, s.total || 0);
      for (const i of s.items || []) {
        const amt = Number(i.total) || (i.price || 0) * (i.qty || 0);
        if (i.name === 'Delivery') { delivery += amt; continue; }
        const p = i.productId ? store.product(i.productId) : null;
        add(prodTotal, i.name, amt); add(prodUnits, i.name, (i.qty || 0) * (i.factor || 1)); add(prodProfit, i.name, amt - (i.cost || 0) * (i.qty || 0));
        add(byCat, p?.category || (i.kind === 'servicio' ? 'Servicios farmacéuticos' : 'Sin categoría'), amt);
        if (p?.lab) add(byLab, p.lab, amt);
        add(byRx, RX[i.rx || 'libre']?.label || 'Venta libre', amt);
        if (i.pack && i.pack !== 'caja' && i.pack !== 'servicio') fractioned += amt;
      }
    }
    for (const s of sales) for (const [k, v] of Object.entries(methodNet(s))) add(methods, k, v);
    // Clasificación ABC (80 / 15 / 5 % de la venta)
    const sorted = top(prodTotal, 9999); const tot = sorted.reduce((a, x) => a + x[1], 0) || 1;
    let acc = 0; const abc = { A: [], B: [], C: [] };
    for (const [k, v] of sorted) { acc += v; (acc / tot <= 0.8 ? abc.A : acc / tot <= 0.95 ? abc.B : abc.C).push([k, v]); }
    // Mermas y vencidos
    const lossT = {}; let loss = 0;
    for (const l of logs) if (['merma', 'vencido', 'uso'].includes(l.type) || (l.type === 'conteo' && l.qty < 0)) { const v = Math.abs(l.qty) * (Number(l.cost) || 0); loss += v; add(lossT, l.type === 'vencido' ? 'Vencidos' : l.type === 'merma' ? 'Merma / daño' : l.type === 'uso' ? 'Uso interno' : 'Faltantes en conteo', v); }
    // Gastos
    const out = moves.filter((m) => m.direction === 'out');
    const expenses = out.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const expCat = {}; out.forEach((m) => add(expCat, m.category || 'Otros', Number(m.amount) || 0));
    // Inventario
    const invCost = store.products.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) / upb(p) * (Number(p.cost) || 0), 0);
    const invPrice = store.products.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) / upb(p) * (Number(p.price) || 0), 0);
    const days = Math.max(1, Math.round((fromKey(to) - fromKey(from)) / 864e5) + 1);
    const coverage = cost > 0 ? invCost / (cost / days) : 0;
    const noMove = store.products.filter((p) => p.sellable !== false && (Number(p.stock) || 0) > 0 && !prodTotal[p.name]).length;
    const perDayArr = []; for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) perDayArr.push([dayKey(d), perDay[dayKey(d)] || 0]);
    return { ventas, billed, cash, cost, profit, ticket, prodTotal, prodUnits, prodProfit, byCat, byLab, byRx, bySeller, perDay: perDayArr, heat, methods, credit, agreementDue, agreementDisc, pointsDisc, delivery, online, fractioned, clients, abc, loss, lossT, expenses, expCat, invCost, invPrice, coverage, noMove, rx };
  }

  function heatHTML(heat) {
    const tot = heat.flat().reduce((a, b) => a + b, 0);
    if (!tot) return emptyState('clock', 'Sin ventas en el período');
    const hrs = []; for (let h = 0; h < 24; h++) if (heat.some((r) => r[h])) hrs.push(h);
    const h0 = Math.min(...hrs); const h1 = Math.max(...hrs);
    const max = Math.max(...heat.flat());
    const order = [1, 2, 3, 4, 5, 6, 0];
    const cols = []; for (let h = h0; h <= h1; h++) cols.push(h);
    return `<div class="dh-wrap"><table class="dh"><thead><tr><th></th>${cols.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${order.map((d) => `<tr><th>${DAYS_SHORT[d]}</th>${cols.map((h) => { const v = heat[d][h]; return `<td title="${DAYS_SHORT[d]} ${h}:00 · ${v} venta(s)" style="--a:${v ? 0.12 + (v / max) * 0.88 : 0}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted mt-xs">Más oscuro = más ventas. Refuerza el mostrador en las horas pico.</p>`;
  }

  function render() {
    const c = compute();
    const maxI = Math.max(1, ...c.perDay.map((x) => x[1]));
    const showDays = c.perDay.length <= 31;
    const margin = c.billed ? c.profit / c.billed * 100 : 0;
    $('#r-body').innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ventas</span><span class="kpi-icon tone-brand">${icon('dollar')}</span></div><div class="kpi-value">${usd(c.billed)}</div><div class="kpi-sub">${c.ventas.length} venta(s) · ticket ${usd(c.ticket)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(c.profit)}</div><div class="kpi-sub">margen ${num(margin, 1)}% sobre la venta</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Pacientes atendidos</span><span class="kpi-icon tone-info">${icon('users')}</span></div><div class="kpi-value">${c.clients.size}</div><div class="kpi-sub">${c.ventas.length ? num(c.ventas.filter((s) => s.memberId).length / c.ventas.length * 100, 0) : 0}% de ventas con paciente</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Recetas despachadas</span><span class="kpi-icon tone-violet">${icon('file')}</span></div><div class="kpi-value">${c.rx.length}</div><div class="kpi-sub">${c.rx.filter((r) => r.controlled).length} con controlados</div></div>
      </div>
      <div class="kpis kpis-sm">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span></div><div class="kpi-value">${usd(c.cash)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Gastos</span></div><div class="kpi-value">${usd(c.expenses)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Mermas y vencidos</span></div><div class="kpi-value ${c.loss > 0 ? 'text-danger' : ''}">${usd(c.loss)}</div><div class="kpi-sub">al costo</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Venta fraccionada</span></div><div class="kpi-value">${usd(c.fractioned)}</div><div class="kpi-sub">blíster y unidad</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Convenios</span></div><div class="kpi-value">${usd(c.agreementDue)}</div><div class="kpi-sub">cubierto · descuentos ${usd(c.agreementDisc)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Pedidos en línea</span></div><div class="kpi-value">${c.online}</div><div class="kpi-sub">delivery ${usd(c.delivery)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">A crédito</span></div><div class="kpi-value">${usd(c.credit)}</div><div class="kpi-sub">saldos hoy ${usd(store.totalDebt)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Puntos canjeados</span></div><div class="kpi-value">${usd(c.pointsDisc)}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><div class="card-title">${icon('dollar')} Ventas por día</div></div>
        ${showDays ? `<div class="bars">${c.perDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${usd(v)}"><i style="height:${v / maxI * 100}%"></i><span>${c.perDay.length > 14 ? k.slice(8) : shortDate(k)}</span></div>`).join('')}</div>` : `<p class="muted small">Total del período: ${usd(c.billed)}</p>`}</div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('trophy')} Productos más vendidos</div>${hbars(top(c.prodTotal, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('trend')} Productos que más ganancia dejan</div>${hbars(top(c.prodProfit, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('grid')} Ventas por categoría</div>${hbars(top(c.byCat, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('flask')} Ventas por laboratorio</div>${hbars(top(c.byLab, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('file')} Por condición de venta</div>${hbars(top(c.byRx), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('wallet')} Formas de pago</div>${hbars(Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => [methodLabel(k), v]).sort((a, b) => b[1] - a[1]), (v) => usd(v))}</div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-title" style="margin-bottom:10px">${icon('layers')} Clasificación ABC</div>
        <div class="kpis kpis-sm"><div class="card kpi"><div class="kpi-label">A · 80% de la venta</div><div class="kpi-value">${c.abc.A.length}</div><div class="kpi-sub">nunca deben faltar</div></div><div class="card kpi"><div class="kpi-label">B · siguiente 15%</div><div class="kpi-value">${c.abc.B.length}</div><div class="kpi-sub">reposición normal</div></div><div class="card kpi"><div class="kpi-label">C · último 5%</div><div class="kpi-value">${c.abc.C.length}</div><div class="kpi-sub">compra mínima</div></div><div class="card kpi"><div class="kpi-label">Sin movimiento</div><div class="kpi-value">${c.noMove}</div><div class="kpi-sub">con existencia y sin ventas</div></div></div>
        <p class="small muted mt-xs">Productos A: ${c.abc.A.slice(0, 12).map(([k]) => esc(k)).join(', ') || '—'}</p></div>
      <div class="card" style="margin-bottom:16px"><div class="card-title" style="margin-bottom:10px">${icon('flame')} Horas pico: ventas por día y hora</div>${heatHTML(c.heat)}</div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('box')} Inventario</div>
          <div class="kv-grid"><div class="kv"><span>Valor al costo</span><b>${usd(c.invCost)}</b></div><div class="kv"><span>Valor a precio de venta</span><b>${usd(c.invPrice)}</b></div><div class="kv"><span>Cobertura</span><b>${c.coverage ? `${num(c.coverage, 0)} días` : '—'}</b></div><div class="kv"><span>Productos activos</span><b>${store.sellable.length}</b></div></div>
          <p class="small muted mt-xs">Cobertura = cuántos días alcanza tu inventario al ritmo de venta del período.</p></div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('trash')} Mermas y vencidos</div>${hbars(top(c.lossT), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('wallet')} Gastos por categoría</div>${hbars(top(c.expCat, 10), (v) => usd(v))}</div>
        ${Object.keys(c.bySeller).length ? `<div class="card"><div class="card-title" style="margin-bottom:10px">${icon('users')} Ventas por vendedor</div>${hbars(top(c.bySeller), (v) => usd(v))}</div>` : ''}
      </div>`;
    data.c = c;
  }

  $('#r-from').onchange = (e) => { from = e.target.value; load(); };
  $('#r-to').onchange = (e) => { to = e.target.value; load(); };
  $('#r-csv').onclick = () => {
    if (!data) return;
    const c = data.c || compute();
    download(`reporte-sanofarmacia-${from}-${to}.csv`, '﻿' + toCSV([
      ['Documento', 'Tipo', 'Fecha', 'Paciente', 'Detalle', 'Total', 'Costo', 'Ganancia', 'Cobrado', 'Convenio', 'Pago', 'Vendedor', 'Usuario'],
      ...data.sales.map((s) => [s.number, s.kind, s.date.slice(0, 16).replace('T', ' '), s.memberName || '', (s.items || []).map((i) => `${i.qty} ${i.name}`).join(' + '), (s.total || 0).toFixed(2), (s.cost || 0).toFixed(2), ((s.total || 0) - (s.cost || 0)).toFixed(2), (s.received || 0).toFixed(2), s.agreementName || '', (s.payments || []).map((p) => methodLabel(p.method)).join(' + '), s.sellerName || '', s.by || '']),
      [], ['Producto', 'Unidades', 'Venta', 'Ganancia', 'Clase ABC'],
      ...top(c.prodTotal, 9999).map(([k, v]) => [k, c.prodUnits[k] || 0, v.toFixed(2), (c.prodProfit[k] || 0).toFixed(2), c.abc.A.some((x) => x[0] === k) ? 'A' : c.abc.B.some((x) => x[0] === k) ? 'B' : 'C'])
    ]), 'text/csv;charset=utf-8');
  };
  $('#r-print').onclick = () => {
    if (!data) return;
    const c = data.c || compute();
    const tbl = (rows, f = (v) => v) => `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${f(v)}</td></tr>`).join('') || '<tr><td>Sin datos</td></tr>'}</tbody></table>`;
    printDoc(`Reporte del ${fmtDate(from)} al ${fmtDate(to)}`, `
      <div class="kpis"><div class="kpi">Ventas<b>${usd(c.billed)}</b></div><div class="kpi">Ganancia bruta<b>${usd(c.profit)}</b></div><div class="kpi">Cobrado<b>${usd(c.cash)}</b></div><div class="kpi">Gastos<b>${usd(c.expenses)}</b></div><div class="kpi">Mermas<b>${usd(c.loss)}</b></div><div class="kpi">Recetas<b>${c.rx.length}</b></div></div>
      <h2>Productos más vendidos</h2>${tbl(top(c.prodTotal, 25), (v) => usd(v))}
      <h2>Ventas por categoría</h2>${tbl(top(c.byCat, 20), (v) => usd(v))}
      <h2>Ventas por laboratorio</h2>${tbl(top(c.byLab, 20), (v) => usd(v))}
      <h2>Formas de pago</h2>${tbl(Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => [methodLabel(k), v]), (v) => usd(v))}
      <h2>Gastos por categoría</h2>${tbl(top(c.expCat, 20), (v) => usd(v))}
      <h2>Mermas y vencidos</h2>${tbl(top(c.lossT), (v) => usd(v))}`);
  };
  setRange('30');
  return null;
}
