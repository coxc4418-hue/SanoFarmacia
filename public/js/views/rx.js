// SanoFarmacia — Libro de recetas y libro de controlados (psicotrópicos / estupefacientes)
import { store } from '../store.js';
import { esc, fmtDate, fmtDateTime, todayKey, dayKey, addDays, startOfDay, endOfDay, fromKey, emptyState, download, toCSV, toast, normalize, debounce, loc, openModal } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';
import { RX, rxBadge, stockText, lotsOf } from '../pharma.js';
import { openClient } from '../client.js';

const RANGES = { hoy: ['Hoy', 0], semana: ['7 días', 6], mes: ['30 días', 29], trimestre: ['90 días', 89] };

export function mount(el) {
  let tab = 'recetas'; let range = 'mes'; let q = ''; let from = ''; let to = '';
  let data = [];
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Recetas y controlados</h1><p class="view-sub">Cada venta con receta queda asentada sola: médico, paciente, producto, lote y si se retuvo la receta.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="rx-csv">${icon('download')} Excel</button><button class="btn btn-primary" id="rx-print">${icon('print')} Imprimir libro</button></div></div>
    <div class="tabs" id="rx-tabs">
      <button data-t="recetas">Libro de recetas</button><button data-t="controlados">Libro de controlados</button><button data-t="existencias">Existencias de controlados</button>
    </div>
    <div class="card card-flush mt">
      <div class="toolbar"><label class="search">${icon('search')}<input id="rx-q" placeholder="Paciente, médico, documento, producto o N°…"></label>
        <div class="row" style="gap:6px;flex-wrap:wrap" id="rx-range"></div></div>
      <div id="rx-body"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  function bounds() {
    if (range === 'custom' && from && to) return [startOfDay(fromKey(from)).toISOString(), endOfDay(fromKey(to)).toISOString()];
    const d = RANGES[range]?.[1] ?? 29;
    return [startOfDay(addDays(new Date(), -d)).toISOString(), endOfDay(new Date()).toISOString()];
  }
  async function load() {
    $('#rx-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    const [a, b] = bounds();
    try { data = (await store.listBetween('prescriptions', 'date', a, b)).sort((x, y) => (y.date || '').localeCompare(x.date || '')); }
    catch (e) { console.error(e); data = []; }
    draw();
  }
  function rows() {
    const t = normalize(q);
    return data.filter((r) => (tab !== 'controlados' || r.controlled) && (!t || normalize(`${r.number} ${r.patient} ${r.patientId} ${r.doctor} ${r.license} ${(r.items || []).map((i) => i.name + ' ' + (i.active || '')).join(' ')}`).includes(t)));
  }

  function drawRange() {
    $('#rx-range').innerHTML = Object.entries(RANGES).map(([k, [l]]) => `<button class="chip ${range === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')
      + `<input type="date" class="input input-sm" id="rx-from" value="${from}" style="width:auto"><input type="date" class="input input-sm" id="rx-to" value="${to}" style="width:auto">`;
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { range = b.dataset.r; drawRange(); load(); });
    const cust = () => { from = $('#rx-from').value; to = $('#rx-to').value; if (from && to) { range = 'custom'; drawRange(); load(); } };
    $('#rx-from').onchange = cust; $('#rx-to').onchange = cust;
  }

  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    $('#rx-range').style.display = tab === 'existencias' ? 'none' : '';
    if (tab === 'existencias') return drawStock();
    const list = rows();
    const n = list.length; const ret = list.filter((r) => r.retained).length;
    $('#rx-body').innerHTML = `<div class="small muted" style="padding:0 16px 10px">${n} registro(s)${ret ? ` · ${ret} con receta retenida` : ''}${tab === 'controlados' ? ' · Solo psicotrópicos y estupefacientes' : ''}</div>`
      + (n ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>N° / fecha</th><th>Paciente</th><th>Médico</th><th>Producto · cantidad · lote</th><th class="c">Receta</th></tr></thead><tbody>${list.map((r) => `<tr style="${r.status === 'anulada' ? 'opacity:.5' : ''}">
        <td><b>${esc(r.number)}</b>${r.status === 'anulada' ? ' <span class="badge badge-danger">Anulada</span>' : ''}<div class="t-sub">${fmtDateTime(r.date)} · ${esc(r.saleNumber || '')}</div></td>
        <td>${r.clientId ? `<button class="linkish" data-c="${r.clientId}"><b>${esc(r.patient || '—')}</b></button>` : `<b>${esc(r.patient || '—')}</b>`}<div class="t-sub">${esc(loc().id)} ${esc(r.patientId || '—')}</div></td>
        <td>${esc(r.doctor || '—')}<div class="t-sub">${esc(r.license || '')}${r.rxNumber ? ` · Rx ${esc(r.rxNumber)}` : ''}${r.rxDate ? ` · ${fmtDate(r.rxDate)}` : ''}</div></td>
        <td class="small">${(r.items || []).map((i) => `<div>${rxBadge({ rx: i.rx }, true)} <b>${esc(i.name)}</b> × ${i.qty}${i.units ? ` (${i.units} und)` : ''}${i.lots ? ` · lote ${esc(i.lots)}` : ''}</div>`).join('')}${r.note ? `<div class="t-sub">${esc(r.note)}</div>` : ''}</td>
        <td class="c">${r.retained ? '<span class="badge badge-warning">Retenida</span>' : '<span class="badge badge-neutral">Devuelta</span>'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div style="padding:8px 16px 20px">${emptyState('file', 'Sin registros en este periodo', 'Cuando vendas un medicamento con receta, antibiótico o controlado, queda anotado aquí automáticamente.')}</div>`);
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
  }

  function drawStock() {
    const list = store.products.filter((p) => p.active !== false && (p.rx === 'controlado' || p.rx === 'antibiotico'));
    $('#rx-body').innerHTML = list.length ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Producto</th><th class="c">Condición</th><th class="r">Existencia</th><th>Lotes</th></tr></thead><tbody>${list.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="t-sub">${esc([p.active, p.strength, p.form].filter(Boolean).join(' · '))}</div></td><td class="c">${rxBadge(p, true)}</td><td class="r num"><b>${stockText(p)}</b><div class="t-sub">${Number(p.stock) || 0} und</div></td><td class="small">${lotsOf(p).map((l) => `${esc(l.lot || 's/l')} (${l.qty}) ${l.exp ? fmtDate(l.exp) : ''}`).join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div style="padding:8px 16px 20px">${emptyState('lock', 'Sin controlados ni antibióticos', 'Marca la condición de venta de cada producto en Inventario.')}</div>`;
  }

  function printBook() {
    if (tab === 'existencias') {
      const list = store.products.filter((p) => p.active !== false && (p.rx === 'controlado' || p.rx === 'antibiotico'));
      printDoc('Existencias de controlados y antibióticos', `<p>Fecha: ${fmtDateTime(new Date().toISOString())}</p><table><thead><tr><th>Producto</th><th>Principio activo</th><th>Condición</th><th>Existencia (und)</th><th>Lotes</th></tr></thead><tbody>${list.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.active || '')} ${esc(p.strength || '')}</td><td>${esc(RX[p.rx]?.label || '')}</td><td>${Number(p.stock) || 0}</td><td>${lotsOf(p).map((l) => `${esc(l.lot || 's/l')} (${l.qty}) ${l.exp || ''}`).join('<br>')}</td></tr>`).join('')}</tbody></table>`, { landscape: true });
      return;
    }
    const list = rows().filter((r) => r.status !== 'anulada');
    const [a, b] = bounds();
    const title = tab === 'controlados' ? 'Libro de control de psicotrópicos y estupefacientes' : 'Libro de recetas despachadas';
    const s = store.settings;
    printDoc(title, `<p><b>${esc(store.businessName)}</b>${s.rif ? ` · ${esc(s.rif)}` : ''}${s.sanitaryLicense ? ` · Permiso sanitario ${esc(s.sanitaryLicense)}` : ''}<br>Farmacéutico responsable: ${esc(s.pharmacist || '________________')}${s.pharmacistLicense ? ` (${esc(s.pharmacistLicense)})` : ''}<br>Periodo: ${fmtDate(a)} al ${fmtDate(b)}</p>
      <table><thead><tr><th>N°</th><th>Fecha</th><th>Paciente / documento</th><th>Médico / matrícula</th><th>Medicamento</th><th>Cant.</th><th>Lote</th><th>Receta</th></tr></thead><tbody>
      ${list.flatMap((r) => (r.items || []).map((i, k) => `<tr><td>${k ? '' : esc(r.number)}</td><td>${k ? '' : fmtDate(r.date)}</td><td>${k ? '' : `${esc(r.patient || '')}<br>${esc(r.patientId || '')}`}</td><td>${k ? '' : `${esc(r.doctor || '')}<br>${esc(r.license || '')}`}</td><td>${esc(i.name)}</td><td>${i.units || i.qty}</td><td>${esc(i.lots || '')}</td><td>${k ? '' : (r.retained ? 'Retenida' : 'Devuelta')}${!k && r.rxNumber ? `<br>N° ${esc(r.rxNumber)}` : ''}</td></tr>`)).join('')}
      </tbody></table><p style="margin-top:28px">Firma del farmacéutico: ______________________</p>`, { landscape: true });
  }
  function exportCSV() {
    const list = tab === 'existencias' ? [] : rows();
    if (!list.length) { toast('No hay registros para exportar', 'warning'); return; }
    const head = ['N°', 'Fecha', 'Venta', 'Paciente', loc().id, 'Médico', 'Matrícula', 'N° receta', 'Fecha receta', 'Producto', 'Condición', 'Cantidad', 'Unidades', 'Lote', 'Retenida', 'Estado'];
    const data = list.flatMap((r) => (r.items || []).map((i) => [r.number, (r.date || '').slice(0, 16).replace('T', ' '), r.saleNumber || '', r.patient || '', r.patientId || '', r.doctor || '', r.license || '', r.rxNumber || '', r.rxDate || '', i.name, RX[i.rx]?.label || '', i.qty, i.units || '', i.lots || '', r.retained ? 'Sí' : 'No', r.status || '']));
    download(`${tab === 'controlados' ? 'libro-controlados' : 'libro-recetas'}-${todayKey()}.csv`, toCSV([head, ...data]), 'text/csv;charset=utf-8');
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  $('#rx-q').oninput = debounce((e) => { q = e.target.value; draw(); }, 120);
  $('#rx-print').onclick = printBook;
  $('#rx-csv').onclick = exportCSV;
  drawRange(); load();
  return store.on('products', () => { if (tab === 'existencias') draw(); });
}
