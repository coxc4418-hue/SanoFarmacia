// SanoFarmacia — Inventario: productos, lotes y vencimientos (FEFO), movimientos, conteo físico e importación
import { store } from '../store.js';
import { saveProduct, moveProduct } from '../ops.js';
import { esc, usd, num, normalize, debounce, emptyState, fmtDate, fmtDateTime, toast, download, toCSV, parseCSV, openModal, setBusy, todayKey, parseNum, confirmDialog, addDays, startOfDay, endOfDay } from '../utils.js';
import { icon } from '../icons.js';
import { FORMS, RX, rxBadge, upb, stockText, lotsOf, expBadge, daysToExpiry, nextExpiry, searchText, productLine, packPrice, fractionable, hasBlister, equivalents } from '../pharma.js';
import { requirePin } from '../auth.js';
import { printDoc } from '../shared.js';

const TABS = { productos: 'Productos', bajo: 'Por reponer', vencimientos: 'Vencimientos', movimientos: 'Movimientos', conteo: 'Conteo físico' };
const MOVE = { entrada: ['Entrada / ajuste +', 'success'], merma: ['Merma / daño', 'danger'], vencido: ['Retiro por vencimiento', 'danger'], devolucion_prov: ['Devolución a proveedor', 'warning'], conteo: ['Conteo físico', 'info'], uso: ['Uso interno', 'neutral'], venta: ['Venta', 'brand'], compra: ['Compra', 'success'], anulacion: ['Anulación', 'warning'] };

export function mount(el, { params = {} }) {
  let tab = TABS[params.tab] ? params.tab : 'productos';
  let q = ''; let cat = ''; let rx = '';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Inventario y lotes</h1><p class="view-sub" id="i-sub"></p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="i-imp">${icon('upload')} Importar</button><button class="btn btn-secondary" id="i-exp">${icon('download')} Exportar</button><button class="btn btn-primary" id="i-new">${icon('plus')} Nuevo producto</button></div></div>
    <div class="tabs" id="i-tabs" data-tour="inv-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}<span class="tab-n" data-n="${k}" hidden></span></button>`).join('')}</div>
    <div id="i-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  function counts() {
    const low = store.lowProducts.length; const exp = store.expiringProducts.length;
    const val = store.products.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) / upb(p) * (Number(p.cost) || 0), 0);
    $('#i-sub').textContent = `${store.products.filter((p) => p.sellable !== false).length} producto(s) · inventario valorado al costo ${usd(val)}`;
    const set = (k, n) => { const b = el.querySelector(`[data-n="${k}"]`); if (b) { b.hidden = !n; b.textContent = n; } };
    set('bajo', low); set('vencimientos', exp);
  }

  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    counts();
    ({ productos, bajo: productos, vencimientos, movimientos, conteo })[tab]();
  }

  // ---------------- PRODUCTOS ----------------
  function productos() {
    const isLow = tab === 'bajo';
    const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))].sort();
    $('#i-body').innerHTML = `<div class="card card-flush">
      <div class="toolbar"><label class="search">${icon('search')}<input id="i-q" value="${esc(q)}" placeholder="Nombre, principio activo, laboratorio o código…"></label>
        <div class="row" style="gap:6px;flex-wrap:wrap"><select class="select select-sm" id="i-cat" style="width:auto"><option value="">Todas las categorías</option>${cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="select select-sm" id="i-rx" style="width:auto"><option value="">Toda condición</option>${Object.entries(RX).map(([k, v]) => `<option value="${k}" ${rx === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div></div>
      ${isLow ? `<div class="small muted" style="padding:0 16px 10px">Productos en o bajo su mínimo. ¿Listo para pedir? Ve a Compras → Sugerido de compra.</div>` : ''}
      <div id="i-list"></div></div>`;
    const list = () => {
      const t = normalize(q);
      let L = isLow ? store.lowProducts : store.products;
      L = L.filter((p) => (!cat || p.category === cat) && (!rx || (p.rx || 'libre') === rx) && (!t || searchText(p).includes(t)));
      if (isLow) L = [...L].sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
      return L;
    };
    const paint = () => {
      const L = list();
      $('#i-list').innerHTML = L.length ? `<div class="table-wrap"><table class="table table-hover table-cards"><thead><tr><th>Producto</th><th class="hide-sm">Categoría</th><th class="c">Condición</th><th class="r">Existencia</th><th class="hide-sm">Próx. vence</th><th class="r">Precio</th></tr></thead><tbody>
        ${L.slice(0, 400).map((p) => { const st = Number(p.stock) || 0; const ex = nextExpiry(p); return `<tr data-id="${p.id}" style="cursor:pointer;${p.sellable === false ? 'opacity:.5' : ''}">
          <td><div class="t-name ellipsis">${esc(p.name)}</div><div class="t-sub ellipsis">${esc(productLine(p))}${p.barcode ? ` · ${esc(p.barcode)}` : ''}</div></td>
          <td class="hide-sm small">${esc(p.category || '—')}${p.location ? `<div class="t-sub">${icon('pin')} ${esc(p.location)}</div>` : ''}</td>
          <td class="c">${rxBadge(p, true) || '<span class="badge badge-success">Libre</span>'}</td>
          <td class="r"><b class="${p.trackStock !== false && st <= 0 ? 'text-danger' : p.trackStock !== false && st <= (p.minStock || 0) ? 'text-warning' : ''}">${p.trackStock === false ? '—' : st <= 0 ? 'Agotado' : stockText(p)}</b><div class="t-sub">mín. ${stockText(p, p.minStock || 0)}</div></td>
          <td class="hide-sm">${ex ? expBadge(ex) : '<span class="faint">—</span>'}</td>
          <td class="r num"><b>${usd(p.price)}</b>${fractionable(p) ? `<div class="t-sub">und ${usd(packPrice(p, 'unidad', store.settings.fractionMarkup))}</div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>${L.length > 400 ? `<div class="small muted center" style="padding:10px">Mostrando 400 de ${L.length}.</div>` : ''}`
        : `<div style="padding:8px 16px 20px">${store.products.length ? emptyState('box', isLow ? 'Nada por reponer' : 'Sin resultados') : emptyState('box', 'Aún no hay productos', 'Agrégalos uno a uno o impórtalos desde Excel (CSV).')}</div>`;
      el.querySelectorAll('#i-list [data-id]').forEach((r) => r.onclick = () => openProduct(r.dataset.id));
    };
    $('#i-q').oninput = debounce((e) => { q = e.target.value; paint(); }, 100);
    $('#i-q').onkeydown = (e) => { if (e.key === 'Enter') { const p = store.byBarcode(e.target.value); if (p) openProduct(p.id); } };
    $('#i-cat').onchange = (e) => { cat = e.target.value; paint(); };
    $('#i-rx').onchange = (e) => { rx = e.target.value; paint(); };
    paint();
  }

  // ---------------- VENCIMIENTOS ----------------
  function vencimientos() {
    const days = Number(store.settings.expiryAlertDays) || 90;
    const lots = store.expiringLots(Math.max(days, 180));
    const g = { vencido: [], d30: [], d60: [], d90: [], mas: [] };
    for (const l of lots) { const d = daysToExpiry(l.exp); (d < 0 ? g.vencido : d <= 30 ? g.d30 : d <= 60 ? g.d60 : d <= 90 ? g.d90 : g.mas).push(l); }
    const val = (L) => L.reduce((a, l) => a + l.qty * ((Number(l.cost) || Number(l.p.cost) || 0) / upb(l.p)), 0);
    const block = (k, title, tone, L) => L.length ? `<div class="card mt"><div class="card-head"><div class="card-title"><span class="badge badge-${tone}">${L.length}</span> ${title}</div><span class="small muted">al costo ${usd(val(L))}</span></div>
      <div class="table-wrap"><table class="table table-cards"><thead><tr><th>Producto</th><th>Lote</th><th class="r">Cantidad</th><th>Vence</th><th></th></tr></thead><tbody>${L.map((l) => `<tr><td><button class="linkish" data-p="${l.p.id}"><b>${esc(l.p.name)}</b></button><div class="t-sub">${esc(l.p.lab || '')}</div></td><td class="mono small">${esc(l.lot || 's/l')}</td><td class="r">${stockText(l.p, l.qty)}</td><td>${fmtDate(l.exp)} ${expBadge(l.exp)}</td><td class="r">${k === 'vencido' ? `<button class="btn btn-danger btn-sm" data-rm="${l.p.id}" data-lot="${esc(l.lot || '')}" data-exp="${esc(l.exp)}" data-q="${l.qty}">${icon('trash')} Retirar</button>` : `<button class="btn btn-ghost btn-sm" data-dev="${l.p.id}" data-lot="${esc(l.lot || '')}" data-exp="${esc(l.exp)}" data-q="${l.qty}">${icon('truck')} Devolver</button>`}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    $('#i-body').innerHTML = `<div class="kpis kpis-sm">
        <div class="card kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value text-danger">${g.vencido.length}</div><div class="kpi-sub">${usd(val(g.vencido))} al costo</div></div>
        <div class="card kpi"><div class="kpi-label">≤ 30 días</div><div class="kpi-value">${g.d30.length}</div><div class="kpi-sub">véndelos primero</div></div>
        <div class="card kpi"><div class="kpi-label">31–60 días</div><div class="kpi-value">${g.d60.length}</div><div class="kpi-sub">promociónalos</div></div>
        <div class="card kpi"><div class="kpi-label">61–90 días</div><div class="kpi-value">${g.d90.length}</div><div class="kpi-sub">negocia devolución</div></div>
      </div>
      <div class="row mt"><button class="btn btn-secondary btn-sm" id="v-print">${icon('print')} Imprimir reporte de vencimientos</button></div>
      ${block('vencido', 'Vencidos: retíralos de la venta', 'danger', g.vencido)}${block('d30', 'Vencen en 30 días', 'danger', g.d30)}${block('d60', 'Vencen en 31 a 60 días', 'warning', g.d60)}${block('d90', 'Vencen en 61 a 90 días', 'warning', g.d90)}${block('mas', 'Vencen en 91 a 180 días', 'info', g.mas)}
      ${!lots.length ? emptyState('checkCircle', 'Sin vencimientos en los próximos 6 meses', 'Registra el lote y la fecha de vencimiento al recibir mercancía y aquí verás las alertas.') : ''}`;
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openProduct(b.dataset.p));
    const mv = (mode) => async (b) => {
      const p = store.product(b.dataset.rm || b.dataset.dev);
      if (!(await confirmDialog({ title: mode === 'vencido' ? 'Retirar lote vencido' : 'Devolver al proveedor', message: `${esc(p.name)} · lote ${esc(b.dataset.lot || 's/l')} · ${stockText(p, +b.dataset.q)} salen del inventario.`, confirmText: 'Confirmar', danger: mode === 'vencido' }))) return;
      try { await moveProduct(p, { mode, units: +b.dataset.q, lot: b.dataset.lot, exp: b.dataset.exp, reason: mode === 'vencido' ? 'Retiro por vencimiento' : 'Devolución por vencimiento próximo' }); toast('Inventario actualizado'); } catch (e) { toast(e.message, 'danger'); }
    };
    el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => mv('vencido')(b));
    el.querySelectorAll('[data-dev]').forEach((b) => b.onclick = () => mv('devolucion_prov')(b));
    $('#v-print').onclick = () => printDoc('Reporte de vencimientos', `<p>${esc(store.businessName)} · ${fmtDateTime(new Date().toISOString())}</p><table><thead><tr><th>Producto</th><th>Laboratorio</th><th>Lote</th><th>Cantidad (und)</th><th>Vence</th><th>Días</th></tr></thead><tbody>${lots.map((l) => `<tr><td>${esc(l.p.name)}</td><td>${esc(l.p.lab || '')}</td><td>${esc(l.lot || 's/l')}</td><td>${l.qty}</td><td>${l.exp}</td><td>${daysToExpiry(l.exp)}</td></tr>`).join('')}</tbody></table>`);
  }

  // ---------------- MOVIMIENTOS ----------------
  async function movimientos() {
    $('#i-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    let rows = [];
    try { rows = (await store.listBetween('inventory_logs', 'date', startOfDay(addDays(new Date(), -30)).toISOString(), endOfDay(new Date()).toISOString())).sort((a, b) => (b.date || '').localeCompare(a.date || '')); } catch (e) { console.error(e); }
    if (tab !== 'movimientos') return;
    $('#i-body').innerHTML = `<div class="card card-flush"><div class="small muted" style="padding:14px 16px 6px">Últimos 30 días · ${rows.length} movimiento(s)</div>${rows.length ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="r">Unidades</th><th class="hide-sm">Lote</th><th class="hide-sm">Detalle</th></tr></thead><tbody>${rows.slice(0, 400).map((r) => { const [l, tone] = MOVE[r.type] || [r.type, 'neutral']; return `<tr><td class="small nowrap">${fmtDateTime(r.date)}</td><td><b>${esc(r.name)}</b></td><td><span class="badge badge-${tone}">${l}</span></td><td class="r num ${r.qty < 0 ? 'text-danger' : 'text-success'}"><b>${r.qty > 0 ? '+' : ''}${r.qty}</b></td><td class="hide-sm small mono">${(r.lots || []).map((x) => esc(x.lot || 's/l')).join(', ')}</td><td class="hide-sm small muted">${esc(r.reason || '')} · ${esc(r.by || '')}</td></tr>`; }).join('')}</tbody></table></div>` : `<div style="padding:8px 16px 20px">${emptyState('history', 'Sin movimientos')}</div>`}</div>`;
  }

  // ---------------- CONTEO FÍSICO ----------------
  function conteo() {
    const counted = {};
    let cq = '';
    $('#i-body').innerHTML = `<div class="card"><div class="card-head"><div class="card-title">${icon('clipboard')} Conteo físico</div><button class="btn btn-primary btn-sm" id="k-save" disabled>${icon('check')} Aplicar ajustes</button></div>
      <p class="small muted" style="margin:0">Escribe lo que cuentas en el estante (en unidades). Solo se ajustan los productos que cambies; la diferencia queda registrada como movimiento.</p>
      <label class="search mt">${icon('search')}<input id="k-q" placeholder="Buscar o escanear…"></label><div id="k-list" class="mt"></div></div>`;
    const paint = () => {
      const t = normalize(cq);
      const L = store.products.filter((p) => p.sellable !== false && p.trackStock !== false && (!t || searchText(p).includes(t))).slice(0, 150);
      $('#k-list').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="r">Sistema</th><th class="r" style="width:130px">Contado (und)</th><th class="r">Dif.</th></tr></thead><tbody>${L.map((p) => { const c = counted[p.id]; const d = c == null ? null : c - (Number(p.stock) || 0); return `<tr><td><b>${esc(p.name)}</b><div class="t-sub">${esc(productLine(p))}${p.location ? ` · ${esc(p.location)}` : ''}</div></td><td class="r">${Number(p.stock) || 0}<div class="t-sub">${stockText(p)}</div></td><td class="r"><input class="input input-sm r" inputmode="numeric" data-k="${p.id}" value="${c ?? ''}" placeholder="—"></td><td class="r num ${d ? (d < 0 ? 'text-danger' : 'text-success') : ''}" data-d="${p.id}">${d == null ? '' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('')}</tbody></table></div>`;
      el.querySelectorAll('[data-k]').forEach((i) => i.oninput = () => {
        const v = i.value.trim(); if (v === '') delete counted[i.dataset.k]; else counted[i.dataset.k] = Math.max(0, Math.round(parseNum(v)));
        const p = store.product(i.dataset.k); const d = counted[p.id] == null ? null : counted[p.id] - (Number(p.stock) || 0);
        const cell = el.querySelector(`[data-d="${p.id}"]`); cell.textContent = d == null ? '' : (d > 0 ? '+' : '') + d; cell.className = 'r num ' + (d ? (d < 0 ? 'text-danger' : 'text-success') : '');
        $('#k-save').disabled = !Object.keys(counted).length;
      });
    };
    $('#k-q').oninput = debounce((e) => { cq = e.target.value; paint(); }, 100);
    $('#k-save').onclick = async (e) => {
      if (!(await requirePin('Aplicar ajustes de inventario'))) return;
      const btn = e.currentTarget; setBusy(btn, true, 'Aplicando…');
      let n = 0;
      for (const [id, units] of Object.entries(counted)) { const p = store.product(id); if (!p || units === (Number(p.stock) || 0)) continue; try { await moveProduct(p, { mode: 'conteo', units, reason: 'Conteo físico' }); n++; } catch (ex) { toast(`${p.name}: ${ex.message}`, 'danger'); } }
      toast(`${n} producto(s) ajustado(s)`); Object.keys(counted).forEach((k) => delete counted[k]); setBusy(btn, false); btn.disabled = true; paint();
    };
    paint();
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  $('#i-new').onclick = async () => { const p = await productForm(); if (p) openProduct(p.id); };
  $('#i-exp').onclick = exportCSV;
  $('#i-imp').onclick = importCSV;
  draw();
  const off = store.on('products', () => { if (tab !== 'conteo' && tab !== 'movimientos') draw(); else counts(); });
  return () => off();
}

// ======================================================================
// FICHA Y FORMULARIO DEL PRODUCTO
// ======================================================================
export function productForm(p0 = null, preset = {}) {
  const p = { rx: 'libre', unitsPerBox: 1, blister: 0, fraction: true, trackStock: true, sellable: true, online: true, minStock: 0, maxStock: 0, ...preset, ...(p0 || {}) };
  return new Promise((resolve) => {
    let saved = null;
    const cats = store.settings.categories || [];
    const m = openModal({
      title: p0 ? 'Editar producto' : 'Nuevo producto', sub: p0 ? esc(p0.name) : 'El precio base es el de la caja; el blíster y la unidad se calculan solos (o fíjalos tú).', size: 'lg',
      body: `<form data-f autocomplete="off">
        <div class="form-grid">
          <div class="field full"><label>Nombre comercial *</label><input class="input" name="name" value="${esc(p.name || '')}" autofocus placeholder="Ej.: Losartán Potásico 50 mg"></div>
          <div class="field"><label>Principio activo</label><input class="input" name="molecule" value="${esc(p.active || '')}" placeholder="Ej.: Losartán"><span class="hint">Sirve para encontrar equivalentes y genéricos.</span></div>
          <div class="field"><label>Concentración</label><input class="input" name="strength" value="${esc(p.strength || '')}" placeholder="Ej.: 50 mg"></div>
          <div class="field"><label>Forma farmacéutica</label><select class="select" name="form"><option value="">—</option>${FORMS.map((f) => `<option ${p.form === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Laboratorio</label><input class="input" name="lab" value="${esc(p.lab || '')}"></div>
          <div class="field"><label>Código de barras</label><input class="input" name="barcode" value="${esc(p.barcode || '')}" placeholder="Escanéalo aquí"></div>
          <div class="field"><label>Código interno (SKU)</label><input class="input" name="sku" value="${esc(p.sku || '')}"></div>
          <div class="field"><label>Categoría</label><select class="select" name="category"><option value="">—</option>${[...new Set([...cats, p.category].filter(Boolean))].map((c) => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Condición de venta</label><select class="select" name="rx">${Object.entries(RX).map(([k, v]) => `<option value="${k}" ${p.rx === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label>Ubicación (estante)</label><input class="input" name="location" value="${esc(p.location || '')}" placeholder="Ej.: A3"></div>
          <div class="field"><label>Proveedor habitual</label><select class="select" name="supplierId"><option value="">—</option>${store.suppliers.map((s) => `<option value="${s.id}" ${p.supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        </div>
        <div class="section-title mt-lg">${icon('layers')} Presentación y precios</div>
        <div class="form-grid">
          <div class="field"><label>Unidades por caja</label><input class="input" name="unitsPerBox" inputmode="numeric" value="${p.unitsPerBox || 1}"><span class="hint">Tabletas, cápsulas, sobres o ampollas.</span></div>
          <div class="field"><label>Unidades por blíster</label><input class="input" name="blister" inputmode="numeric" value="${p.blister || ''}" placeholder="0 = no se vende por blíster"></div>
          <div class="field"><label>Costo por caja</label><input class="input" name="cost" inputmode="decimal" value="${p.cost ? num(p.cost) : ''}"></div>
          <div class="field"><label>Precio de venta (caja) *</label><input class="input" name="price" inputmode="decimal" value="${p.price ? num(p.price) : ''}"></div>
          <div class="field"><label>Precio por blíster</label><input class="input" name="blisterPrice" inputmode="decimal" value="${p.blisterPrice ? num(p.blisterPrice) : ''}" placeholder="Automático"></div>
          <div class="field"><label>Precio por unidad</label><input class="input" name="unitPrice" inputmode="decimal" value="${p.unitPrice ? num(p.unitPrice) : ''}" placeholder="Automático"></div>
        </div>
        <div class="box small mt-xs" data-calc></div>
        <div class="row row-wrap mt" style="gap:14px">
          <label class="check"><input type="checkbox" name="fraction" ${p.fraction !== false ? 'checked' : ''}> <span>Se vende fraccionado</span></label>
          <label class="check"><input type="checkbox" name="trackStock" ${p.trackStock !== false ? 'checked' : ''}> <span>Controlar existencia</span></label>
          <label class="check"><input type="checkbox" name="online" ${p.online !== false ? 'checked' : ''}> <span>Mostrar en el catálogo en línea</span></label>
          <label class="check"><input type="checkbox" name="sellable" ${p.sellable !== false ? 'checked' : ''}> <span>Activo para vender</span></label>
        </div>
        <div class="section-title mt-lg">${icon('box')} Existencia</div>
        <div class="form-grid">
          <div class="field"><label>Stock mínimo (unidades)</label><input class="input" name="minStock" inputmode="numeric" value="${p.minStock || ''}"><span class="hint">Avisa para reponer.</span></div>
          <div class="field"><label>Stock máximo (unidades)</label><input class="input" name="maxStock" inputmode="numeric" value="${p.maxStock || ''}"><span class="hint">Hasta dónde sugerir la compra.</span></div>
          ${p0 ? '' : `<div class="field"><label>Existencia inicial (cajas)</label><input class="input" name="initBoxes" inputmode="decimal" placeholder="0"></div>
          <div class="field"><label>+ unidades sueltas</label><input class="input" name="initUnits" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>Lote</label><input class="input" name="lot"></div>
          <div class="field"><label>Vencimiento</label><input class="input" type="date" name="exp"></div>`}
        </div>
        <div class="field mt"><label>Notas</label><input class="input" name="notes" value="${esc(p.notes || '')}" placeholder="Ej.: conservar refrigerado"></div>
        <div class="error-msg mt" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${p0 ? 'Guardar' : 'Crear producto'}</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    const calc = () => {
      const k = Math.max(1, Math.round(parseNum(F.unitsPerBox.value) || 1)); const pr = parseNum(F.price.value); const c = parseNum(F.cost.value);
      const tmp = { price: pr, unitsPerBox: k, blister: parseNum(F.blister.value), fraction: F.fraction.checked, blisterPrice: parseNum(F.blisterPrice.value), unitPrice: parseNum(F.unitPrice.value) };
      const mk = store.settings.fractionMarkup;
      m.el.querySelector('[data-calc]').innerHTML = pr ? `Caja ${usd(pr)}${hasBlister(tmp) ? ` · blíster ${usd(packPrice(tmp, 'blister', mk))}` : ''}${fractionable(tmp) ? ` · unidad ${usd(packPrice(tmp, 'unidad', mk))}` : ''}${c ? ` · margen <b>${Math.round((pr - c) / pr * 100)}%</b> (${usd(pr - c)})` : ''}` : 'Escribe el precio de la caja.';
    };
    ['unitsPerBox', 'blister', 'price', 'cost', 'blisterPrice', 'unitPrice', 'fraction'].forEach((k) => F[k].addEventListener('input', calc));
    calc();
    m.el.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); m.el.querySelector('[data-ok]').click(); };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre.'; return; }
      if (!(parseNum(F.price.value) > 0)) { err.textContent = 'Escribe el precio de venta de la caja.'; return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      const k = Math.max(1, Math.round(parseNum(F.unitsPerBox.value) || 1));
      const data = {
        name: F.name.value, active: F.molecule.value, strength: F.strength.value, form: F.form.value, lab: F.lab.value, barcode: F.barcode.value, sku: F.sku.value, category: F.category.value, rx: F.rx.value, location: F.location.value, supplierId: F.supplierId.value || null,
        unitsPerBox: k, blister: parseNum(F.blister.value), cost: parseNum(F.cost.value), price: parseNum(F.price.value), blisterPrice: parseNum(F.blisterPrice.value), unitPrice: parseNum(F.unitPrice.value),
        fraction: F.fraction.checked, trackStock: F.trackStock.checked, online: F.online.checked, sellable: F.sellable.checked, minStock: parseNum(F.minStock.value), maxStock: parseNum(F.maxStock.value), notes: F.notes.value
      };
      const initial = p0 ? null : { units: Math.round((parseNum(F.initBoxes.value) || 0) * k + (parseNum(F.initUnits.value) || 0)), lot: F.lot.value, exp: F.exp.value };
      try {
        saved = await saveProduct(data, p0?.id || null, initial);
        m.close(); toast(p0 ? 'Producto actualizado' : 'Producto creado');
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

export function openProduct(id) {
  const p = store.product(id);
  if (!p) return;
  const eq = equivalents(p, store.products);
  const lots = lotsOf(p);
  const m = openModal({
    title: esc(p.name), sub: esc(productLine(p)), size: 'lg',
    body: `<div class="stack">
      <div class="row row-wrap" style="gap:6px">${rxBadge(p) || '<span class="badge badge-success">Venta libre</span>'}${p.category ? `<span class="badge badge-neutral">${esc(p.category)}</span>` : ''}${p.location ? `<span class="badge badge-neutral">${icon('pin')} ${esc(p.location)}</span>` : ''}${p.sellable === false ? '<span class="badge badge-danger">Inactivo</span>' : ''}${p.barcode ? `<span class="badge badge-neutral mono">${esc(p.barcode)}</span>` : ''}</div>
      <div class="kpis kpis-sm">
        <div class="card kpi"><div class="kpi-label">Existencia</div><div class="kpi-value" style="font-size:20px">${stockText(p)}</div><div class="kpi-sub">${Number(p.stock) || 0} unidades · mín. ${p.minStock || 0}</div></div>
        <div class="card kpi"><div class="kpi-label">Precio caja</div><div class="kpi-value" style="font-size:20px">${usd(p.price)}</div><div class="kpi-sub">${fractionable(p) ? `unidad ${usd(packPrice(p, 'unidad', store.settings.fractionMarkup))}` : 'no se fracciona'}</div></div>
        <div class="card kpi"><div class="kpi-label">Costo caja</div><div class="kpi-value" style="font-size:20px">${usd(p.cost || 0)}</div><div class="kpi-sub">${p.price && p.cost ? `margen ${Math.round((p.price - p.cost) / p.price * 100)}%` : '—'}</div></div>
        <div class="card kpi"><div class="kpi-label">Vendidas</div><div class="kpi-value" style="font-size:20px">${Number(p.sold) || 0}</div><div class="kpi-sub">unidades en total</div></div>
      </div>
      <div><div class="section-title">${icon('layers')} Lotes en existencia (sale primero el que vence antes)</div>${lots.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Lote</th><th>Vence</th><th class="r">Cantidad</th></tr></thead><tbody>${lots.map((l) => `<tr><td class="mono">${esc(l.lot || 's/l')}</td><td>${l.exp ? `${fmtDate(l.exp)} ${expBadge(l.exp)}` : '—'}</td><td class="r">${stockText(p, l.qty)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted">Sin lotes registrados.</div>'}</div>
      ${eq.length ? `<div><div class="section-title">${icon('refresh')} Equivalentes</div><div class="small">${eq.map((x) => `${esc(x.name)} (${usd(x.price)} · ${stockText(x)})`).join(' · ')}</div></div>` : ''}
    </div>`,
    footer: `<button class="btn btn-ghost" data-a="edit">${icon('edit')} Editar</button><span class="grow"></span><button class="btn btn-secondary" data-a="out">${icon('minus')} Salida</button><button class="btn btn-primary" data-a="in">${icon('plus')} Entrada</button>`
  });
  m.el.querySelector('[data-a="edit"]').onclick = async () => { m.close(); if (await productForm(p)) openProduct(id); };
  m.el.querySelector('[data-a="in"]').onclick = () => { m.close(); moveForm(p, 'entrada'); };
  m.el.querySelector('[data-a="out"]').onclick = () => { m.close(); moveForm(p, 'merma'); };
}

function moveForm(p, mode0) {
  let mode = mode0;
  const lots = lotsOf(p);
  const m = openModal({
    title: mode0 === 'entrada' ? 'Entrada de inventario' : 'Salida de inventario', sub: `${esc(p.name)} · hay ${stockText(p)}`, size: 'md',
    body: `<div class="stack">
      ${mode0 === 'entrada' ? '<div class="hint">Para compras a proveedores usa Compras → Recibir mercancía (actualiza el costo y la cuenta por pagar).</div>' : `<div class="chips chips-wrap">${['merma', 'vencido', 'devolucion_prov', 'uso'].map((k) => `<button type="button" class="chip ${k === mode ? 'on' : ''}" data-m="${k}">${MOVE[k][0]}</button>`).join('')}</div>`}
      <div class="form-grid">
        <div class="field"><label>Cajas</label><input class="input" data-b inputmode="decimal" placeholder="0"></div>
        <div class="field"><label>+ unidades</label><input class="input" data-u inputmode="numeric" placeholder="0"></div>
        ${mode0 === 'entrada' ? '<div class="field"><label>Lote</label><input class="input" data-lot></div><div class="field"><label>Vencimiento</label><input class="input" type="date" data-exp></div>'
          : `<div class="field full"><label>Lote</label><select class="select" data-ls><option value="">Automático (el que vence primero)</option>${lots.map((l, i) => `<option value="${i}">${esc(l.lot || 's/l')} · ${l.exp || 'sin fecha'} · ${l.qty} und</option>`).join('')}</select></div>`}
        <div class="field full"><label>Motivo</label><input class="input" data-r placeholder="Ej.: caja dañada"></div>
      </div><div class="error-msg" data-err></div></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Registrar</button>`
  });
  const q = (s) => m.el.querySelector(s);
  m.el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { mode = b.dataset.m; m.el.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b)); });
  q('[data-ok]').onclick = async (e) => {
    const units = Math.round((parseNum(q('[data-b]').value) || 0) * upb(p) + (parseNum(q('[data-u]').value) || 0));
    if (!(units > 0)) { q('[data-err]').textContent = 'Indica la cantidad.'; return; }
    if (mode !== 'entrada' && !(await requirePin('Registrar una salida de inventario'))) return;
    setBusy(e.currentTarget, true);
    const L = mode !== 'entrada' && q('[data-ls]')?.value !== '' ? lots[+q('[data-ls]').value] : null;
    try {
      await moveProduct(p, { mode, units, lot: mode === 'entrada' ? q('[data-lot]').value : (L?.lot || ''), exp: mode === 'entrada' ? q('[data-exp]').value : (L?.exp || ''), reason: q('[data-r]').value || MOVE[mode][0] });
      m.close(); toast('Inventario actualizado');
    } catch (ex) { q('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
  };
}

function exportCSV() {
  const head = ['Nombre', 'Principio activo', 'Concentración', 'Forma', 'Laboratorio', 'Código de barras', 'SKU', 'Categoría', 'Condición', 'Unidades por caja', 'Unidades por blíster', 'Costo caja', 'Precio caja', 'Precio blíster', 'Precio unidad', 'Existencia (und)', 'Mínimo', 'Máximo', 'Ubicación', 'Próximo vencimiento'];
  const data = store.products.map((p) => [p.name, p.active || '', p.strength || '', p.form || '', p.lab || '', p.barcode || '', p.sku || '', p.category || '', RX[p.rx || 'libre']?.label || '', upb(p), p.blister || '', p.cost || 0, p.price || 0, p.blisterPrice || '', p.unitPrice || '', Number(p.stock) || 0, p.minStock || 0, p.maxStock || 0, p.location || '', nextExpiry(p)]);
  download(`inventario-${todayKey()}.csv`, toCSV([head, ...data]), 'text/csv;charset=utf-8');
  toast(`${data.length} producto(s) exportados`);
}

function importCSV() {
  const m = openModal({
    title: 'Importar productos', sub: 'Desde Excel o Google Sheets guardado como CSV', size: 'md',
    body: `<div class="stack"><p class="small" style="margin:0">Columnas reconocidas: <b>Nombre</b> y <b>Precio</b> (obligatorias), Principio activo, Concentración, Forma, Laboratorio, Código de barras, Categoría, Condición (libre/receta/antibiótico/controlado), Unidades por caja, Costo, Existencia (unidades), Lote, Vencimiento, Mínimo. Los códigos de barras repetidos se omiten.</p>
      <input type="file" accept=".csv,text/csv" class="input" data-file><div data-prev></div><div class="error-msg" data-err></div></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('upload')} Importar</button>`
  });
  let parsed = [];
  const pick = (h, ...keys) => h.findIndex((x) => keys.some((k) => normalize(x).includes(k)));
  const rxOfText = (t) => { const n = normalize(t); return /control|psico|estupe/.test(n) ? 'controlado' : /antibi/.test(n) ? 'antibiotico' : /receta|rx/.test(n) ? 'receta' : 'libre'; };
  const toDate = (v) => { const s = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (d) return `${d[3].length === 2 ? '20' + d[3] : d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; const my = /^(\d{1,2})[/.-](\d{4})$/.exec(s); return my ? `${my[2]}-${my[1].padStart(2, '0')}-28` : ''; };
  m.el.querySelector('[data-file]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rows = parseCSV(await f.text()).filter((r) => r.some((x) => String(x).trim()));
    const h = rows.shift() || [];
    const ix = { name: pick(h, 'nombre', 'producto', 'descripcion'), active: pick(h, 'principio', 'activo', 'generico'), strength: pick(h, 'concentr'), form: pick(h, 'forma', 'presentacion'), lab: pick(h, 'laborat', 'marca'), barcode: pick(h, 'barra', 'ean', 'codigo'), category: pick(h, 'categ', 'familia'), rx: pick(h, 'condic', 'receta'), upb: pick(h, 'unidades por caja', 'contenido'), cost: pick(h, 'costo'), price: pick(h, 'precio', 'pvp'), stock: pick(h, 'existencia', 'stock', 'cantidad'), lot: pick(h, 'lote'), exp: pick(h, 'venc', 'caduc', 'expir'), min: pick(h, 'minimo') };
    if (ix.name < 0 || ix.price < 0) { m.el.querySelector('[data-err]').textContent = 'Necesito al menos las columnas “Nombre” y “Precio”.'; return; }
    const seen = new Set();
    parsed = rows.map((r) => { const g = (k) => (ix[k] >= 0 ? String(r[ix[k]] ?? '').trim() : ''); return { name: g('name'), active: g('active'), strength: g('strength'), form: g('form'), lab: g('lab'), barcode: g('barcode'), category: g('category'), rx: rxOfText(g('rx')), unitsPerBox: parseNum(g('upb')) || 1, cost: parseNum(g('cost')), price: parseNum(g('price')), minStock: parseNum(g('min')), _units: parseNum(g('stock')), _lot: g('lot'), _exp: toDate(g('exp')) }; })
      .filter((x) => { if (!x.name || !(x.price > 0)) return false; if (x.barcode) { if (seen.has(x.barcode) || store.byBarcode(x.barcode)) return false; seen.add(x.barcode); } return true; });
    m.el.querySelector('[data-prev]').innerHTML = `<div class="box small"><b>${parsed.length}</b> producto(s) listos${rows.length - parsed.length ? ` · ${rows.length - parsed.length} omitido(s)` : ''}.<div class="t-sub mt-xs">${parsed.slice(0, 4).map((x) => esc(x.name)).join(' · ')}${parsed.length > 4 ? '…' : ''}</div></div>`;
    m.el.querySelector('[data-ok]').disabled = !parsed.length;
  };
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const btn = e.currentTarget; setBusy(btn, true, 'Importando…');
    let ok = 0;
    for (const x of parsed) {
      const { _units, _lot, _exp, ...d } = x;
      try { await saveProduct(d, null, { units: Math.round(_units || 0), lot: _lot, exp: _exp }); ok++; btn.textContent = `Importando ${ok}/${parsed.length}…`; } catch (err) { console.warn(err.message); }
    }
    m.close(); toast(`${ok} producto(s) importados`);
  };
}
