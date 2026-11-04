// SanoFarmacia — Pacientes: buscador, formulario, ficha (alergias, tratamientos, mediciones, compras y recetas) y tarjeta
import { store, clientBadge, SEX } from './store.js';
import { saveClient, setClientActive, renewCardCode, cardUrl, payBalance, adjustPoints, saveTreatment, removeTreatment, addMeasure, markRefillNotified } from './ops.js';
import { CONDITIONS, ALLERGIES, MEASURES, measureFlag, productLine, upb, searchText, rxBadge } from './pharma.js';
import { openModal, esc, usd, toast, setBusy, fmtDate, fmtDateTime, todayKey, dayKey, addDays, loc, normalize, debounce, initials, colorFor, confirmDialog, emptyState, printHTML, num, parseNum } from './utils.js';
import { icon } from './icons.js';
import { qrDataURL, waClient, printReceipt, PRINT_HEAD } from './shared.js';
import { requirePin } from './auth.js';

const nav = async (route, params = {}) => { const { navigate } = await import('./main.js'); navigate(route, { params, force: true }); };

export function avatar(c, size = '') { return `<span class="avatar ${size}" style="background:${colorFor(c?.name)}">${esc(initials(c?.name))}</span>`; }
export function hydratePhotos() {}
const age = (bd) => { if (!bd) return null; const d = new Date(bd + 'T12:00:00'); const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
export const clientLine = (c) => {
  const tr = store.treatmentsOf(c);
  const next = tr.map((t) => ({ t, d: store.refillIn(t) })).filter((x) => x.d != null).sort((a, b) => a.d - b.d)[0];
  const bits = [];
  if (next) bits.push(next.d < 0 ? `sin ${next.t.name.split(' ')[0]} hace ${-next.d} d` : next.d === 0 ? `recompra hoy: ${next.t.name.split(' ')[0]}` : `recompra en ${next.d} d`);
  else if (c?.lastVisitAt) bits.push(`última compra ${fmtDate(c.lastVisitAt)}`);
  else bits.push('sin compras aún');
  return bits.join(' · ');
};
/** Alertas clínicas (alergias y condiciones) en una línea */
export function alertsHTML(c, compact = false) {
  const al = (c?.allergies || []).filter(Boolean); const co = (c?.conditions || []).filter(Boolean);
  if (!al.length && !co.length) return '';
  return `<div class="row row-wrap" style="gap:4px">${al.map((a) => `<span class="badge badge-danger">${icon('alert')} Alergia: ${esc(a)}</span>`).join('')}${compact ? '' : co.map((a) => `<span class="badge badge-info">${esc(a)}</span>`).join('')}</div>`;
}
export function pointsHTML(c) {
  const L = store.loyalty;
  if (!L?.enabled) return '';
  const pts = Math.floor(Number(c?.points) || 0);
  return `<span class="badge badge-violet">${icon('star')} ${pts} pts${L.pointValue ? ` · ${usd(pts * L.pointValue)}` : ''}</span>`;
}

// ======================================================================
// BUSCAR / ELEGIR PACIENTE
// ======================================================================
export function pickClient({ title = 'Buscar paciente', allowNew = true } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Nombre, cédula, teléfono o N° de paciente…" autocomplete="off" autofocus></label><div class="pick-list" data-l></div></div>`,
      footer: `${allowNew ? `<button class="btn btn-secondary" data-new style="margin-right:auto">${icon('userPlus')} Paciente nuevo</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button>`,
      onClose: () => resolve(picked)
    });
    const draw = (q = '') => {
      const t = normalize(q); const d = q.replace(/\D/g, '');
      const list = store.clients.filter((x) => x.active !== false && (!t || normalize(`${x.name} ${x.number || ''} ${x.idDoc || ''}`).includes(t) || (d.length >= 3 && (String(x.phone || '').replace(/\D/g, '').includes(d) || String(x.idDoc || '').replace(/\D/g, '').includes(d))))).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((x) => `<button type="button" class="list-item" data-id="${x.id}">${avatar(x)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(x.name)}</b><div class="t-sub">${esc(x.number)}${x.idDoc ? ' · ' + esc(x.idDoc) : ''}${x.phone ? ' · ' + esc(x.phone) : ''}</div>${alertsHTML(x, true)}</div>${clientBadge(store.clientStatus(x))}</button>`).join('')
        : emptyState('users', t ? 'Sin resultados' : 'Aún no hay pacientes', allowNew ? 'Regístralo con “Paciente nuevo”.' : '');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.client(b.dataset.id); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    m.el.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') { const f = store.findClient(e.target.value); if (f) { picked = f; m.close(); } } };
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = async () => { const q = m.el.querySelector('[data-q]').value.trim(); const isNum = /\d{6,}/.test(q); const r = await clientForm(null, { name: isNum ? '' : q, idDoc: isNum ? q : '' }); if (r) { picked = r; m.close(); } };
    draw();
  });
}

// ======================================================================
// FORMULARIO DEL PACIENTE
// ======================================================================
export function clientForm(client = null, preset = {}) {
  const x = { ...preset, ...(client || {}) };
  return new Promise((resolve) => {
    let saved = null;
    const al = new Set(x.allergies || []); const co = new Set(x.conditions || []);
    const m = openModal({
      title: client ? 'Editar paciente' : 'Nuevo paciente', sub: client ? esc(client.number) : 'Con nombre y teléfono basta. Las alergias y condiciones avisan al vender.', size: 'lg',
      body: `<form data-f autocomplete="off">
        <div class="form-grid">
          <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(x.name || '')}" autofocus></div>
          <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(x.idDoc || '')}" placeholder="Para recetas y convenios"></div>
          <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel" value="${esc(x.phone || '')}" placeholder="Para avisarle de su recompra"></div>
          <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(x.birthDate || '')}"></div>
          <div class="field"><label>Sexo</label><select class="select" name="sex"><option value="">—</option>${Object.entries(SEX).map(([k, v]) => `<option value="${k}" ${x.sex === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field full"><label>Dirección (para delivery)</label><input class="input" name="address" value="${esc(x.address || '')}"></div>
          <div class="field"><label>Convenio / seguro</label><select class="select" name="agreementId"><option value="">Ninguno</option>${store.activeAgreements.map((a) => `<option value="${a.id}" ${x.agreementId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>N° de afiliado / póliza</label><input class="input" name="agreementNumber" value="${esc(x.agreementNumber || '')}"></div>
          <div class="field"><label>Médico tratante</label><input class="input" name="doctor" value="${esc(x.doctor || '')}" placeholder="Opcional"></div>
          <div class="field"><label>Correo</label><input class="input" name="email" inputmode="email" value="${esc(x.email || '')}"></div>
        </div>
        <div class="section-title mt-lg">${icon('alert')} Alergias a medicamentos</div>
        <div class="chips chips-wrap" data-al>${[...new Set([...ALLERGIES, ...al])].map((c) => `<button type="button" class="chip ${al.has(c) ? 'on chip-danger' : ''}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="row mt-xs"><input class="input input-sm" data-al-new placeholder="Otra alergia…" style="max-width:260px"><button type="button" class="btn btn-secondary btn-sm" data-al-add>${icon('plus')}</button></div>
        <div class="section-title mt">${icon('heart')} Condiciones crónicas</div>
        <div class="chips chips-wrap" data-co>${[...new Set([...CONDITIONS, ...co])].map((c) => `<button type="button" class="chip ${co.has(c) ? 'on' : ''}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="field mt"><label>Notas</label><input class="input" name="notes" value="${esc(x.notes || '')}" placeholder="Ej.: prefiere genéricos; recoge su hija"></div>
        <div class="error-msg mt" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${client ? 'Guardar' : 'Registrar paciente'}</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    const chipSet = (sel, set, cls = '') => m.el.querySelectorAll(`${sel} [data-v]`).forEach((b) => b.onclick = () => { const v = b.dataset.v; set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle('on', set.has(v)); if (cls) b.classList.toggle(cls, set.has(v)); });
    chipSet('[data-al]', al, 'chip-danger'); chipSet('[data-co]', co);
    m.el.querySelector('[data-al-add]').onclick = () => {
      const i = m.el.querySelector('[data-al-new]'); const v = i.value.trim(); if (!v) return;
      al.add(v); i.value = '';
      m.el.querySelector('[data-al]').insertAdjacentHTML('beforeend', `<button type="button" class="chip on chip-danger" data-v="${esc(v)}">${esc(v)}</button>`);
      chipSet('[data-al]', al, 'chip-danger');
    };
    m.el.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); m.el.querySelector('[data-ok]').click(); };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre del paciente.'; F.name.focus(); return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      const data = { name: F.name.value, idDoc: F.idDoc.value, phone: F.phone.value, birthDate: F.birthDate.value, sex: F.sex.value, address: F.address.value, agreementId: F.agreementId.value, agreementNumber: F.agreementNumber.value, doctor: F.doctor.value, email: F.email.value, notes: F.notes.value, allergies: [...al], conditions: [...co] };
      try {
        saved = await saveClient(data, client?.id || null);
        m.close();
        toast(client ? 'Paciente actualizado' : `Paciente registrado: ${saved.number}`);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

// ======================================================================
// TRATAMIENTO CONTINUO Y MEDICIONES
// ======================================================================
/** Busca un producto del inventario (modal). Resuelve con el producto o null. */
export function pickProduct({ title = 'Buscar producto', filter = null } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({ title, size: 'md', body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Nombre comercial, principio activo o código…" autofocus autocomplete="off"></label><div class="pick-list" data-l></div></div>`, footer: '<button class="btn btn-secondary" data-close>Cancelar</button>', onClose: () => resolve(picked) });
    const draw = (q = '') => {
      const t = normalize(q);
      const exact = store.byBarcode(q);
      const list = (exact ? [exact] : store.products.filter((p) => p.active !== false && (!filter || filter(p)) && (!t || searchText(p).includes(t)))).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.map((p) => `<button type="button" class="list-item" data-id="${p.id}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon('pill')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(productLine(p))}</div></div>${rxBadge(p, true)}<b class="num">${usd(p.price)}</b></button>`).join('') || emptyState('box', 'Sin resultados');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.product(b.dataset.id); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    draw();
  });
}

export function treatmentForm(c, t0 = null) {
  const t = t0 || { name: '', productId: null, dailyUnits: 1, everyDays: 30, lastAt: todayKey(), doctor: c.doctor || '', note: '' };
  return new Promise((resolve) => {
    let saved = null; let prod = t.productId ? store.product(t.productId) : null;
    const m = openModal({
      title: t0 ? 'Editar tratamiento' : 'Tratamiento continuo', sub: `${esc(c.name)} · Le avisamos antes de que se le acabe`, size: 'md',
      body: `<div class="stack"><button type="button" class="btn btn-secondary btn-block" data-p>${icon('pill')} <span data-pn>${prod ? esc(prod.name) : t.name ? esc(t.name) : 'Elegir el medicamento'}</span></button>
        <div class="form-grid">
          <div class="field"><label>Unidades que toma al día</label><input class="input" data-du inputmode="decimal" value="${t.dailyUnits || ''}" placeholder="Ej.: 1 tableta"><span class="hint">Con esto calculamos cuánto le dura cada compra.</span></div>
          <div class="field"><label>Si no, compra cada (días)</label><input class="input" data-ed inputmode="numeric" value="${t.everyDays || 30}"></div>
          <div class="field"><label>Última compra</label><input class="input" type="date" data-la value="${esc(t.lastAt || '')}"></div>
          <div class="field"><label>Médico</label><input class="input" data-dr value="${esc(t.doctor || '')}"></div>
          <div class="field full"><label>Indicación</label><input class="input" data-nt value="${esc(t.note || '')}" placeholder="Ej.: 1 tableta en la mañana"></div>
        </div><div class="box small" data-calc></div><div class="error-msg" data-err></div></div>`,
      footer: `${t0 ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Quitar</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const calc = () => {
      const du = parseNum(q('[data-du]').value); const k = prod ? upb(prod) : 0;
      const days = du > 0 && k ? Math.floor(k / du) : Number(q('[data-ed]').value) || 30;
      const last = q('[data-la]').value;
      q('[data-calc]').innerHTML = `${icon('clock')} ${du > 0 && k ? `Una caja (${k} und) le dura <b>${days} días</b>.` : `Compra cada <b>${days} días</b>.`}${last ? ` Próxima compra: <b>${fmtDate(dayKey(addDays(new Date(last + 'T12:00:00'), days)))}</b>.` : ''}`;
      return days;
    };
    q('[data-p]').onclick = async () => { const p = await pickProduct({ title: 'Medicamento del tratamiento' }); if (p) { prod = p; q('[data-pn]').textContent = p.name; calc(); } };
    ['[data-du]', '[data-ed]', '[data-la]'].forEach((s) => { q(s).oninput = calc; });
    calc();
    q('[data-ok]').onclick = async (e) => {
      if (!prod && !t.name) { q('[data-err]').textContent = 'Elige el medicamento.'; return; }
      setBusy(e.currentTarget, true);
      const days = calc(); const last = q('[data-la]').value;
      try {
        saved = await saveTreatment(c, { ...t, productId: prod?.id || t.productId || null, name: prod?.name || t.name, dailyUnits: parseNum(q('[data-du]').value), everyDays: days, lastAt: last, nextAt: last ? dayKey(addDays(new Date(last + 'T12:00:00'), days)) : '', doctor: q('[data-dr]').value, note: q('[data-nt]').value });
        m.close(); toast('Tratamiento guardado');
      } catch (ex) { q('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    q('[data-del]')?.addEventListener('click', async () => { await removeTreatment(c, t0.id); saved = { removed: true }; m.close(); toast('Tratamiento quitado', 'warning'); });
  });
}

export function measureForm(c = null) {
  return new Promise((resolve) => {
    let saved = null; let type = 'tension'; let cl = c;
    const m = openModal({
      title: 'Control de salud', sub: 'Tensión, glucosa y otros controles del servicio farmacéutico', size: 'md',
      body: `<div class="stack">${c ? '' : `<button type="button" class="btn btn-secondary btn-block" data-c>${icon('user')} <span data-cn>Elegir paciente (opcional)</span></button>`}
        <div class="chips chips-wrap" data-t>${Object.entries(MEASURES).map(([k, v]) => `<button type="button" class="chip ${k === type ? 'on' : ''}" data-v="${k}">${icon(v.icon)} ${v.label}</button>`).join('')}</div>
        <div class="form-grid"><div class="field"><label data-l1>Valor</label><input class="input input-lg" data-v1 inputmode="decimal" autofocus></div><div class="field" data-f2><label>Diastólica</label><input class="input input-lg" data-v2 inputmode="decimal"></div></div>
        <div data-flag></div>
        <div class="field"><label>Nota</label><input class="input" data-n placeholder="Ej.: en ayunas, después de caminar"></div>
        <div class="hint">Resultado orientativo: no sustituye la consulta médica.</div><div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Registrar</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const upd = () => {
      const M = MEASURES[type];
      q('[data-l1]').textContent = M.two ? 'Sistólica (mmHg)' : `${M.label} (${M.unit})`;
      q('[data-f2]').hidden = !M.two;
      m.el.querySelectorAll('[data-t] [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === type));
      const v1 = parseNum(q('[data-v1]').value); const v2 = parseNum(q('[data-v2]').value);
      const [lab, tone] = v1 ? measureFlag(type, v1, v2) : ['', ''];
      q('[data-flag]').innerHTML = lab ? `<span class="badge badge-${tone}" style="height:28px;font-size:13px">${esc(lab)}</span>` : '';
    };
    m.el.querySelectorAll('[data-t] [data-v]').forEach((b) => b.onclick = () => { type = b.dataset.v; upd(); q('[data-v1]').focus(); });
    q('[data-v1]').oninput = upd; q('[data-v2]').oninput = upd;
    q('[data-c]')?.addEventListener('click', async () => { const p = await pickClient(); if (p) { cl = p; q('[data-cn]').textContent = p.name; } });
    upd();
    q('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try {
        saved = await addMeasure(cl, { type, value: parseNum(q('[data-v1]').value), value2: MEASURES[type].two ? parseNum(q('[data-v2]').value) : '', note: q('[data-n]').value });
        saved.client = cl;
        m.close(); toast('Control registrado');
        if (cl?.phone) {
          const M = MEASURES[type]; const [lab] = measureFlag(type, saved.value, saved.value2);
          const txt = `${M.label}: *${saved.value}${M.two ? '/' + saved.value2 : ''} ${M.unit}* (${lab})`;
          const w = openModal({ title: 'Enviar resultado', sub: esc(cl.name), size: 'sm', body: `<p class="small">${esc(txt.replace(/\*/g, ''))}</p>`, footer: `<button class="btn btn-secondary" data-close>Ahora no</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` });
          w.el.querySelector('[data-wa]').onclick = () => { waClient('medicion', { client: cl, extra: txt }); w.close(); };
        }
      } catch (ex) { q('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}

// ======================================================================
// FICHA DEL PACIENTE
// ======================================================================
const TABS = { resumen: 'Resumen', tratamientos: 'Tratamientos', controles: 'Controles', compras: 'Compras', recetas: 'Recetas' };
export async function openClient(id, { tab = 'resumen' } = {}) {
  let cl = store.client(id) || await store.getClient(id);
  if (!cl) { toast('Paciente no encontrado', 'warning'); return; }
  const cache = {};
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('member-modal');
  const root = m.el.querySelector('[data-root]');
  const load = async (k, fn) => (cache[k] ??= await fn().catch((e) => { console.error(e); return []; }));
  const off = store.on('clients', () => { const n = store.client(id); if (n) { cl = n; header(); if (tab === 'tratamientos' || tab === 'resumen') draw(); } });
  const close0 = m.close; m.close = () => { off(); close0(); };

  root.innerHTML = `<div data-head></div><div class="tabs mt" data-tabs>${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join('')}</div><div data-body class="mt"></div>`;
  const $ = (q) => root.querySelector(q);

  function header() {
    const st = store.clientStatus(cl);
    const bal = Number(cl.balance) || 0;
    const ag = cl.agreementId ? store.agreement(cl.agreementId) : null;
    const a = age(cl.birthDate);
    $('[data-head]').innerHTML = `<div class="mhead">
      ${avatar(cl, 'avatar-xl')}
      <div class="grow" style="min-width:0">
        <div class="row row-wrap"><h2 class="mhead-name">${esc(cl.name)}</h2>${clientBadge(st)}${bal > 0.009 ? `<span class="badge badge-danger">Debe ${usd(bal)}</span>` : ''}${pointsHTML(cl)}${ag ? `<span class="badge badge-info">${icon('handshake')} ${esc(ag.name)}</span>` : ''}</div>
        <div class="t-sub">${esc(cl.number)}${cl.idDoc ? ` · ${esc(loc().id)} ${esc(cl.idDoc)}` : ''}${cl.phone ? ` · ${esc(cl.phone)}` : ''}${a != null ? ` · ${a} años` : ''}${cl.sex ? ` · ${SEX[cl.sex]}` : ''}</div>
        <div class="small mt">${clientLine(cl)}</div>
        ${alertsHTML(cl) ? `<div class="mt-xs">${alertsHTML(cl)}</div>` : ''}
      </div>
      <button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="mactions">
      <button class="btn btn-primary" data-a="sell">${icon('cart')} Vender</button>
      <button class="btn btn-secondary" data-a="tr">${icon('pill')} Tratamiento</button>
      <button class="btn btn-secondary" data-a="ms">${icon('pulse')} Control</button>
      ${bal > 0.009 ? `<button class="btn btn-secondary" data-a="debt">${icon('dollar')} Cobrar saldo</button>` : ''}
      <button class="btn btn-secondary" data-a="card">${icon('qr')} Tarjeta</button>
      <button class="btn btn-whatsapp" data-a="wa">${icon('whatsapp')} WhatsApp</button>
      <button class="btn btn-ghost" data-a="edit">${icon('edit')} Editar</button>
      <button class="btn btn-ghost btn-icon" data-a="more" title="Más opciones">${icon('menu')}</button>
    </div>`;
    $('[data-x]').onclick = () => m.close();
    root.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => action(b.dataset.a));
  }

  async function action(a) {
    if (a === 'sell') { m.close(); nav('vender', { clientId: cl.id }); }
    if (a === 'tr') { const r = await treatmentForm(cl); if (r) { tab = 'tratamientos'; draw(); } }
    if (a === 'ms') { const r = await measureForm(cl); if (r) { cache.measures = null; tab = 'controles'; draw(); } }
    if (a === 'debt') { await payDebtModal(cl); cache.sales = null; draw(); }
    if (a === 'card') cardModal(cl);
    if (a === 'edit') { const r = await clientForm(cl); if (r) { cl = { ...cl, ...r }; header(); draw(); } }
    if (a === 'wa') waMenu(cl);
    if (a === 'more') moreMenu();
  }

  function moreMenu() {
    const mm = openModal({
      title: 'Más opciones', sub: esc(cl.name), size: 'sm',
      body: `<div class="list">
        ${store.loyalty.enabled ? `<button class="list-item" data-o="pts">${icon('star')}<div class="grow"><b>Ajustar puntos</b><div class="t-sub">Cortesía o corrección (PIN)</div></div></button>` : ''}
        <button class="list-item" data-o="code">${icon('refresh')}<div class="grow"><b>Nuevo código de tarjeta</b><div class="t-sub">Si compartió su enlace</div></div></button>
        <button class="list-item" data-o="baja">${icon(cl.active === false ? 'unlock' : 'x')}<div class="grow"><b>${cl.active === false ? 'Reactivar paciente' : 'Dar de baja'}</b><div class="t-sub">${cl.active === false ? 'Vuelve a la lista' : 'Se conserva su historial'}</div></div></button>
      </div>`,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
    mm.el.querySelector('[data-o="pts"]')?.addEventListener('click', async () => {
      mm.close();
      if (!(await requirePin('Ajustar puntos'))) return;
      const f = openModal({ title: 'Puntos', sub: esc(cl.name), size: 'sm', body: `<div class="form-grid"><div class="field"><label>Puntos</label><input class="input" type="number" min="0" data-p value="${Math.floor(Number(cl.points) || 0)}"></div><div class="field full"><label>Motivo</label><input class="input" data-why placeholder="Ej.: cortesía"></div></div>`, footer: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>' });
      f.el.querySelector('[data-ok]').onclick = async () => { await adjustPoints(cl, f.el.querySelector('[data-p]').value, f.el.querySelector('[data-why]').value); f.close(); toast('Puntos actualizados'); };
    });
    mm.el.querySelector('[data-o="code"]').onclick = async () => {
      mm.close();
      if (!(await confirmDialog({ title: 'Nuevo código de tarjeta', message: 'El enlace anterior de su tarjeta dejará de funcionar.', confirmText: 'Generar' }))) return;
      const code = await renewCardCode(cl); cl = { ...cl, cardCode: code }; toast('Código renovado'); cardModal(cl);
    };
    mm.el.querySelector('[data-o="baja"]').onclick = async () => {
      mm.close();
      if (cl.active === false) { await setClientActive(cl, true); toast('Paciente reactivado'); return; }
      if (!(await confirmDialog({ title: 'Dar de baja', message: `${esc(cl.name)} dejará de aparecer en la lista y en los avisos. Su historial se conserva.`, confirmText: 'Dar de baja', danger: true }))) return;
      await setClientActive(cl, false); toast('Paciente dado de baja', 'warning');
    };
  }

  async function draw() {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('[data-body]');
    body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try { await TAB_RENDER[tab](body); } catch (e) { console.error(e); body.innerHTML = emptyState('alert', 'No se pudo cargar', esc(e.message)); }
  }

  const trList = (body) => {
    const list = store.treatmentsOf(cl);
    return list.length ? `<div class="list">${list.map((t) => {
      const d = store.refillIn(t);
      const tone = d == null ? 'neutral' : d < 0 ? 'danger' : d <= (Number(store.settings.refillNoticeDays) || 3) ? 'warning' : 'success';
      const p = t.productId ? store.product(t.productId) : null;
      return `<div class="list-item"><span class="kpi-icon tone-${tone === 'neutral' ? 'brand' : tone}" style="width:38px;height:38px">${icon('pill')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(t.name)}</b><div class="t-sub">${t.dailyUnits ? `${num(t.dailyUnits, t.dailyUnits % 1 ? 1 : 0)} und/día` : `cada ${t.everyDays} días`}${t.note ? ' · ' + esc(t.note) : ''}${t.lastAt ? ` · compró ${fmtDate(t.lastAt)}` : ''}</div>
        <div class="small">${d == null ? '<span class="faint">Sin fecha de recompra</span>' : `<span class="badge badge-${tone}">${d < 0 ? `Se le acabó hace ${-d} día(s)` : d === 0 ? 'Se le acaba hoy' : `Le alcanza ${d} día(s) · ${fmtDate(t.nextAt)}`}</span>`}${p ? ` <span class="t-sub">· existencia: ${(Number(p.stock) || 0) >= upb(p) ? 'disponible' : '<b class="text-danger">sin stock</b>'}</span>` : ''}</div></div>
        <div class="row" style="gap:4px">${cl.phone && d != null ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wt="${t.id}" title="Avisar recompra">${icon('whatsapp')}</button>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-et="${t.id}" title="Editar">${icon('edit')}</button></div></div>`;
    }).join('')}</div>` : emptyState('pill', 'Sin tratamientos continuos', 'Agrega las medicinas que toma siempre (tensión, diabetes, tiroides…) y te avisamos antes de que se le acaben.');
  };
  const bindTr = (body) => {
    body.querySelectorAll('[data-et]').forEach((b) => b.onclick = async () => { const t = (cl.treatments || []).find((x) => x.id === b.dataset.et); if (await treatmentForm(cl, t)) draw(); });
    body.querySelectorAll('[data-wt]').forEach((b) => b.onclick = () => { const t = (cl.treatments || []).find((x) => x.id === b.dataset.wt); waClient('recompra', { client: cl, treatment: t }); markRefillNotified(cl, t.id); });
  };

  const TAB_RENDER = {
    async resumen(body) {
      const qr = cl.cardCode ? await qrDataURL(cardUrl(cl.cardCode), 3) : '';
      const ag = cl.agreementId ? store.agreement(cl.agreementId) : null;
      const lm = cl.lastMeasure;
      body.innerHTML = `<div class="grid-main">
        <div class="stack">
          <div class="kpis kpis-sm">
            <div class="card kpi"><div class="kpi-label">Compras</div><div class="kpi-value">${cl.visits || 0}</div><div class="kpi-sub">desde ${fmtDate(cl.createdAt)}</div></div>
            <div class="card kpi"><div class="kpi-label">Gasto total</div><div class="kpi-value">${usd(cl.totalSpent || 0)}</div><div class="kpi-sub">${cl.visits ? `promedio ${usd((cl.totalSpent || 0) / cl.visits)}` : '—'}</div></div>
            <div class="card kpi"><div class="kpi-label">Tratamientos</div><div class="kpi-value">${store.treatmentsOf(cl).length}</div><div class="kpi-sub">medicinas continuas</div></div>
            <div class="card kpi"><div class="kpi-label">Último control</div><div class="kpi-value" style="font-size:18px">${lm ? `${lm.value}${lm.value2 ? '/' + lm.value2 : ''}` : '—'}</div><div class="kpi-sub">${lm ? `${esc(MEASURES[lm.type]?.label || '')} · ${fmtDate(lm.date)}` : 'sin controles'}</div></div>
          </div>
          <div class="card"><div class="card-head"><div class="card-title">${icon('pill')} Tratamientos y recompras</div><button class="btn btn-ghost btn-sm" data-add-tr>${icon('plus')} Agregar</button></div>${trList(body)}</div>
          <div class="card"><div class="card-title">${icon('info')} Datos clínicos</div>
            <div class="kv-grid mt">
              <div class="kv"><span>Alergias</span><b class="${(cl.allergies || []).length ? 'text-danger' : ''}">${esc((cl.allergies || []).join(', ') || 'Ninguna registrada')}</b></div>
              <div class="kv"><span>Condiciones</span><b>${esc((cl.conditions || []).join(', ') || '—')}</b></div>
              <div class="kv"><span>Médico tratante</span><b>${esc(cl.doctor || '—')}</b></div>
              <div class="kv"><span>Convenio</span><b>${ag ? `${esc(ag.name)}${cl.agreementNumber ? ' · ' + esc(cl.agreementNumber) : ''}` : '—'}</b></div>
              ${cl.address ? `<div class="kv kv-1"><span>Dirección</span><b>${esc(cl.address)}</b></div>` : ''}
              ${cl.notes ? `<div class="kv kv-1"><span>Notas</span><b>${esc(cl.notes)}</b></div>` : ''}
            </div></div>
        </div>
        <div class="stack">
          ${store.loyalty.enabled ? `<div class="card"><div class="card-title">${icon('star')} Puntos</div><div class="kpi-value mt">${Math.floor(Number(cl.points) || 0)} <small>pts</small></div><div class="small muted">${store.loyalty.pointValue ? `Equivalen a <b>${usd(Math.floor(Number(cl.points) || 0) * store.loyalty.pointValue)}</b> de descuento` : ''}</div></div>` : ''}
          <div class="card center">${qr ? `<img src="${qr}" class="qr-img" alt="QR">` : ''}<div class="mono small mt-xs">${esc(cl.cardCode || '')}</div><div class="small muted">Tarjeta digital: puntos y recompras</div><button class="btn btn-secondary btn-sm mt" data-card>${icon('whatsapp')} Enviar tarjeta</button></div>
        </div>
      </div>`;
      bindTr(body);
      body.querySelector('[data-add-tr]').onclick = async () => { if (await treatmentForm(cl)) draw(); };
      body.querySelector('[data-card]').onclick = () => waClient('tarjeta', { client: cl });
    },
    async tratamientos(body) {
      body.innerHTML = `<div class="between"><div class="small muted">La fecha de recompra se recalcula sola cada vez que compra su medicina.</div><button class="btn btn-primary btn-sm" data-add>${icon('plus')} Agregar tratamiento</button></div><div class="mt">${trList(body)}</div>`;
      bindTr(body);
      body.querySelector('[data-add]').onclick = async () => { if (await treatmentForm(cl)) draw(); };
    },
    async controles(body) {
      const list = await load('measures', () => store.clientMeasures(cl.id));
      body.innerHTML = `<div class="between"><div class="small muted">${list.length} control(es)</div><button class="btn btn-primary btn-sm" data-add>${icon('plus')} Nuevo control</button></div>
        ${list.length ? `<div class="table-wrap mt"><table class="table"><thead><tr><th>Fecha</th><th>Control</th><th class="r">Valor</th><th>Resultado</th><th class="hide-sm">Nota</th></tr></thead><tbody>${list.map((x) => { const M = MEASURES[x.type] || { label: x.type, unit: '' }; const [lab, tone] = measureFlag(x.type, x.value, x.value2); return `<tr><td class="small nowrap">${fmtDateTime(x.date)}</td><td>${esc(M.label)}</td><td class="r num"><b>${x.value}${x.value2 ? '/' + x.value2 : ''}</b> <span class="t-sub">${esc(M.unit)}</span></td><td>${lab ? `<span class="badge badge-${tone}">${lab}</span>` : ''}</td><td class="hide-sm small muted">${esc(x.note || '')}</td></tr>`; }).join('')}</tbody></table></div>` : emptyState('pulse', 'Sin controles', 'Registra tensión, glucosa, peso o temperatura y lleva su historial.')}`;
      body.querySelector('[data-add]').onclick = async () => { if (await measureForm(cl)) { cache.measures = null; draw(); } };
    },
    async compras(body) {
      const sales = await load('sales', () => store.clientSales(cl.id));
      body.innerHTML = sales.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fecha</th><th>Detalle</th><th class="r">Total</th><th></th></tr></thead><tbody>${sales.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}${s.rxId ? ' <span class="badge badge-info">Rx</span>' : ''}</td><td class="small">${fmtDateTime(s.date)}</td><td class="small">${(s.items || []).map((i) => esc(i.name)).join(', ')}</td><td class="r num"><b>${usd(s.total)}</b>${s.credit ? `<div class="t-sub text-danger">pendiente ${usd(s.credit)}</div>` : ''}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}">${icon('print')}</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('receipt', 'Sin compras registradas');
      body.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(sales.find((s) => s.id === b.dataset.pr)));
    },
    async recetas(body) {
      const list = await load('rx', () => store.clientRx(cl.id));
      body.innerHTML = list.length ? `<div class="list">${list.map((r) => `<div class="list-item"><span class="kpi-icon tone-${r.controlled ? 'danger' : 'info'}" style="width:38px;height:38px">${icon('file')}</span><div class="grow" style="min-width:0"><b>${esc(r.number)} · ${fmtDate(r.date)}</b>${r.status === 'anulada' ? ' <span class="badge badge-danger">Anulada</span>' : ''}<div class="t-sub">Dr(a). ${esc(r.doctor || '—')}${r.license ? ' · ' + esc(r.license) : ''}${r.retained ? ' · receta retenida' : ''}</div><div class="small">${(r.items || []).map((i) => `${esc(i.name)} × ${i.qty}`).join(' · ')}</div></div></div>`).join('')}</div>`
        : emptyState('file', 'Sin recetas', 'Las ventas de medicamentos con receta quedan registradas aquí.');
    }
  };

  root.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  header(); draw();
}

function waMenu(cl) {
  const L = store.loyalty;
  const tr = store.treatmentsOf(cl).filter((t) => t.nextAt);
  const opts = [
    ...tr.map((t) => [`recompra:${t.id}`, `Recompra: ${t.name}`, t.nextAt ? `se le acaba ${fmtDate(t.nextAt)}` : '']),
    ['tarjeta', 'Enviar su tarjeta', 'Puntos y recompras'],
    ...(store.settings.shop?.enabled !== false && store.settings.shop?.slug ? [['catalogo', 'Enlace para pedir en línea', 'Catálogo con precios']] : []),
    ...(L.enabled && Number(cl.points) > 0 ? [['puntos', 'Sus puntos', `${Math.floor(cl.points)} pts`]] : []),
    ...((Number(cl.balance) || 0) > 0.009 ? [['deuda', 'Recordar saldo pendiente', usd(cl.balance)]] : []),
    ['cumple', 'Feliz cumpleaños', 'Con un detalle'],
    ['libre', 'Mensaje libre', 'Escribe lo que quieras']
  ];
  const m = openModal({
    title: 'WhatsApp', sub: esc(cl.name), size: 'sm',
    body: `<div class="list">${opts.map(([k, t, s]) => `<button class="list-item" data-k="${k}">${icon('whatsapp')}<div class="grow"><b>${esc(t)}</b><div class="t-sub">${esc(s)}</div></div></button>`).join('')}</div>`,
    footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
  });
  m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
    const k = b.dataset.k; m.close();
    if (k.startsWith('recompra:')) { const t = tr.find((x) => x.id === k.slice(9)); waClient('recompra', { client: cl, treatment: t }); markRefillNotified(cl, t.id); return; }
    waClient(k, { client: cl });
  });
}

// ======================================================================
// SALDO Y TARJETA
// ======================================================================
export async function payDebtModal(cl) {
  const { openPay, showPaid } = await import('./pay.js');
  const bal = Number(cl.balance) || 0;
  const out = await openPay({ title: 'Cobrar saldo pendiente', sub: esc(cl.name), amount: bal, editable: true, max: bal, onConfirm: async (r) => { const res = await payBalance(cl, { amount: r.amount, payments: r.payments }); if (r.print) printReceipt(res.sale); return res; } });
  if (out) showPaid(out.sale, { title: 'Abono registrado', onPrint: () => printReceipt(out.sale) });
}
export async function cardModal(cl) {
  const qr = await qrDataURL(cardUrl(cl.cardCode), 5);
  const m = openModal({
    title: 'Tarjeta del paciente', sub: esc(cl.name), size: 'sm',
    body: `<div class="center stack" style="align-items:center"><img src="${qr}" class="qr-img lg" alt="QR"><div class="mono small">${esc(cl.cardCode)}</div>${pointsHTML(cl)}
      <div class="small muted">El paciente abre el enlace en su teléfono: ve sus puntos, sus tratamientos con la fecha de recompra y el botón para pedir en línea. En el mostrador, escanea su QR para encontrarlo al instante.</div></div>`,
    footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><button class="btn btn-secondary" data-pr>${icon('print')} Imprimir</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>`
  });
  m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(cardUrl(cl.cardCode)); toast('Enlace copiado'); } catch (_) { toast(cardUrl(cl.cardCode), 'info', 6000); } };
  m.el.querySelector('[data-pr]').onclick = () => printCard(cl);
  m.el.querySelector('[data-wa]').onclick = () => waClient('tarjeta', { client: cl });
}
/** Tarjeta de cliente tamaño CR80 */
export async function printCard(cl) {
  const qr = await qrDataURL(cardUrl(cl.cardCode), 6);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Tarjeta ${esc(cl.number)}</title><style>
    @page { size: auto; margin: 10mm; } body { font-family: Arial, Helvetica, sans-serif; }
    .card { width: 85.6mm; height: 54mm; border-radius: 3.5mm; overflow: hidden; position: relative; background: linear-gradient(135deg,#065f46,#022c22); color: #fff; display: flex; box-shadow: 0 0 0 .2mm #999; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .l { flex: 1; padding: 4mm; display: flex; flex-direction: column; gap: 1.2mm; }
    .brand { font-size: 2.6mm; letter-spacing: .4mm; text-transform: uppercase; color: #6ee7b7; font-weight: 700; }
    .shop { font-size: 3.6mm; font-weight: 700; }
    .nm { font-size: 3.9mm; font-weight: 800; line-height: 1.1; margin-top: auto; } .num { font-size: 2.6mm; color: #a7f3d0; }
    .cross { font-size: 9mm; line-height: 1; color: #34d399; font-weight: 900; }
    .r { width: 30mm; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm; color: #111; }
    .r img { width: 25mm; height: 25mm; } .r small { font-size: 2.1mm; font-family: monospace; }
  </style></head><body>
  <div class="card"><div class="l"><div class="brand">Paciente · SanoFarmacia</div><div class="shop">${esc(store.businessName)}</div><div class="cross">✚</div>
    <div class="nm">${esc(cl.name)}</div><div class="num">${esc(cl.number)}${store.settings.phone ? ' · ' + esc(store.settings.phone) : ''}</div></div>
    <div class="r"><img src="${qr}"><small>${esc(cl.cardCode)}</small><small>Tu tarjeta digital</small></div></div>
  </body></html>`);
}
