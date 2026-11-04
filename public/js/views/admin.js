// SanoFarmacia — Panel del administrador general (multisede)
import { listTenants, updateTenant, tenantSalesSince, getUsername, setUsername, deleteUsername, createTenantDoc, setAnnouncement, getAnnouncement, DEFAULT_SETTINGS } from '../store.js';
import { db, doc, writeBatch, createAuthUser, Timestamp } from '../firebase.js';
import { DOMAIN } from '../auth.js';
import { esc, usd, toast, confirmDialog, emptyState, initials, colorFor, startOfDay, fmtDate, toggleTheme, normalize, debounce, openModal, setBusy, sha256, nowISO, waLink, toCSV, download, addDays, dayKey, fromKey } from '../utils.js';
import { icon } from '../icons.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => ALPHA[x % ALPHA.length]).join('');
const genPass = () => `Sf-${rnd(9)}!${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
const genPin = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
export const PLANS = ['Básico', 'Profesional', 'Premium', 'Cortesía'];
const APP_URL = 'https://sano-farmacia.web.app';

const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ? new Date(v).getTime() : 0);
const daysLeft = (t) => (t.paidUntil ? Math.ceil((ms(t.paidUntil) - Date.now()) / 864e5) : null);
function status(t) {
  if (t.deleted) return { k: 'deleted', label: 'Eliminada', badge: 'badge-neutral' };
  if (t.active === false) return { k: 'frozen', label: 'Congelada', badge: 'badge-info' };
  const d = daysLeft(t);
  if (d !== null && d <= 0) return { k: 'expired', label: 'Vencida', badge: 'badge-danger' };
  if (d !== null && d <= 7) return { k: 'soon', label: `Vence en ${d} d`, badge: 'badge-warning' };
  return { k: 'active', label: 'Activa', badge: 'badge-success' };
}

/** Crea una sede: cuenta en Firebase Auth + documento de sede + configuración + PIN + usuario. */
export async function createSede({ name, username, email, password, pin, plan, paidUntil, ownerName, ownerPhone }) {
  const uid = await createAuthUser(email, password);
  const now = nowISO();
  await createTenantDoc(uid, {
    name, code: username, ownerUid: uid, ownerEmail: email, active: true, createdAt: now, createdBy: 'admin',
    plan: plan || 'Básico', paidUntil: paidUntil ? Timestamp.fromDate(paidUntil) : null, ownerName: ownerName || '', ownerPhone: ownerPhone || '', notes: ''
  });
  const b = writeBatch(db);
  b.set(doc(db, 'tenants', uid, 'config', 'settings'), { ...DEFAULT_SETTINGS, businessName: name });
  b.set(doc(db, 'tenants', uid, 'config', 'security'), { pinHash: await sha256(`${uid}:${pin}`), updatedAt: now });
  await b.commit();
  await setUsername(username, { email, uid, createdAt: now });
  return uid;
}

export function mount(el, { enter, logout }) {
  let tenants = [];
  let demos = 0;
  let stats = {};
  let search = '';
  let filter = 'all';
  let alive = true;
  const demoAlive = (t) => ms(t.expiresAt) > Date.now();

  el.innerHTML = `
    <div class="admin-wrap">
      <header class="admin-top">
        <img src="/assets/logo.svg" alt="">
        <div class="grow"><div class="tb-title">SanoFarmacia</div><div class="tb-sub">Panel de administración de sedes</div></div>
        <button class="btn btn-ghost btn-icon" id="a-theme" title="Tema">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn btn-secondary btn-sm" id="a-out">${icon('logout')} Salir</button>
      </header>
      <main class="content">
        <div class="view-header">
          <div><h1 class="view-title">Sedes</h1><p class="view-sub">Cada farmacia tiene sus pacientes, inventario y lotes, ventas, recetas, compras y caja completamente aislados.</p></div>
          <div class="view-actions"><button class="btn btn-secondary" id="a-ann">${icon('bell')} Aviso general</button><button class="btn btn-secondary" id="a-csv">${icon('download')} Exportar</button><button class="btn btn-secondary btn-icon" id="a-refresh" title="Actualizar">${icon('refresh')}</button><button class="btn btn-primary" id="a-new">${icon('plus')} Nueva sede</button></div>
        </div>
        <div class="kpis" id="a-kpis"></div>
        <div class="card card-flush">
          <div class="toolbar"><label class="search">${icon('search')}<input id="a-search" placeholder="Buscar por nombre, usuario, dueño o teléfono…"></label>
            <div class="chips" id="a-filters"></div></div>
          <div id="a-list"><div class="empty"><div class="spinner"></div></div></div>
        </div>
      </main>
    </div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    $('#a-list').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try {
      const all = await listTenants();
      demos = all.filter((t) => t.demo === true && demoAlive(t)).length;
      tenants = all.filter((t) => t.demo !== true);
      // Limpia en segundo plano las demos vencidas que quedaron abandonadas
      const expired = all.filter((t) => t.demo === true && !demoAlive(t));
      if (expired.length) import('../demo.js').then(async ({ purgeTenant }) => { for (const t of expired) await purgeTenant(t.id, true); }).catch(() => {});
    } catch (e) { $('#a-list').innerHTML = `<div style="padding:20px">${emptyState('alert', 'No se pudieron cargar las sedes', esc(e.message))}</div>`; return; }
    render();
    const since = startOfDay().toISOString();
    await Promise.all(tenants.filter((t) => !t.deleted).map(async (t) => {
      try {
        const sales = await tenantSalesSince(t.id, since);
        const open = null;
        const ok = sales.filter((s) => s.status !== 'voided');
        stats[t.id] = { total: ok.reduce((a, s) => a + (s.received || 0), 0), count: ok.length, open };
      } catch (_) { stats[t.id] = { total: 0, count: 0, open: null }; }
    }));
    if (alive) render();
  }

  function render() {
    const live = tenants.filter((t) => !t.deleted);
    const counts = { all: live.length, active: 0, frozen: 0, expired: 0, soon: 0, deleted: tenants.length - live.length };
    live.forEach((t) => { counts[status(t).k]++; });
    const totalToday = Object.values(stats).reduce((a, s) => a + (s.total || 0), 0);
    const openAll = Object.values(stats).reduce((a, s) => a + (s.open || 0), 0);
    $('#a-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Sedes</span><span class="kpi-icon tone-brand">${icon('building')}</span></div><div class="kpi-value">${live.length}</div><div class="kpi-sub">${counts.active + counts.soon} activas</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Congeladas / vencidas</span><span class="kpi-icon tone-info">${icon('lock')}</span></div><div class="kpi-value">${counts.frozen + counts.expired}</div><div class="kpi-sub">${counts.soon} por vencer en 7 días</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Demos en curso</span><span class="kpi-icon tone-violet">${icon('sparkle')}</span></div><div class="kpi-value">${demos}</div><div class="kpi-sub">pruebas de 30 minutos</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado hoy (todas)</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(totalToday)}</div><div class="kpi-sub">${tenants.filter((t) => !t.deleted && !t.demo).length} farmacia(s) con cuenta</div></div>`;
    const F = { all: 'Todas', active: 'Activas', soon: 'Por vencer', expired: 'Vencidas', frozen: 'Congeladas', deleted: 'Eliminadas' };
    $('#a-filters').innerHTML = Object.entries(F).map(([k, v]) => `<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${v} <span class="count">${counts[k]}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; render(); });

    const q = normalize(search);
    const list = tenants.filter((t) => (filter === 'deleted' ? t.deleted : !t.deleted && (filter === 'all' || status(t).k === filter))
      && (!q || normalize(`${t.name} ${t.code} ${t.ownerEmail} ${t.ownerName} ${t.ownerPhone}`).includes(q)));
    $('#a-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Sede</th><th class="hide-sm">Plan</th><th class="c">Estado</th><th class="r">Hoy</th><th class="hide-sm">Dueño</th><th class="r">Acciones</th></tr></thead><tbody>
      ${list.map((t) => {
        const st = stats[t.id]; const s = status(t);
        return `<tr style="${t.deleted ? 'opacity:.55' : ''}">
          <td><div class="row"><span class="avatar" style="background:${colorFor(t.code || t.name)}">${esc(initials(t.name))}</span><div><div class="t-name">${esc(t.name || 'Sin nombre')}</div><div class="t-sub"><span class="mono">${esc(t.code || '')}</span> · desde ${fmtDate(t.createdAt)}</div></div></div></td>
          <td class="hide-sm"><b>${esc(t.plan || '—')}</b><div class="t-sub">${t.paidUntil ? 'Vence ' + fmtDate(new Date(ms(t.paidUntil)).toISOString()) : 'Sin vencimiento'}</div></td>
          <td class="c"><span class="badge ${s.badge}">${s.label}</span>${t.active === false && t.frozenReason ? `<div class="t-sub">${esc(t.frozenReason)}</div>` : ''}</td>
          <td class="r num">${t.deleted ? '' : st ? `<b>${usd(st.total)}</b><div class="t-sub">${st.count} cobro(s)</div>` : '<span class="faint">…</span>'}</td>
          <td class="hide-sm small">${esc(t.ownerName || '')}${t.ownerPhone ? `<div class="row" style="gap:4px"><span class="t-sub">${esc(t.ownerPhone)}</span><a class="btn btn-ghost btn-icon btn-sm" href="${waLink(t.ownerPhone, `Hola ${t.ownerName || ''}, te escribimos de SanoFarmacia.`)}" target="_blank" rel="noopener" title="WhatsApp">${icon('whatsapp')}</a></div>` : ''}</td>
          <td class="r nowrap">${t.deleted
            ? `<button class="btn btn-secondary btn-sm" data-restore="${t.id}">${icon('refresh')} Restaurar</button>`
            : `<button class="btn btn-primary btn-sm" data-enter="${t.id}">${icon('arrowRight')} Entrar</button>
               <button class="btn btn-ghost btn-icon btn-sm" data-renew="${t.id}" title="Renovar 30 días">${icon('clock')}</button>
               <button class="btn btn-ghost btn-icon btn-sm" data-tog="${t.id}" title="${t.active === false ? 'Activar' : 'Congelar'}">${icon(t.active === false ? 'unlock' : 'lock')}</button>
               <button class="btn btn-ghost btn-icon btn-sm" data-ed="${t.id}" title="Editar">${icon('edit')}</button>`}
          </td></tr>`;
      }).join('')}</tbody></table></div>` : `<div style="padding:20px">${emptyState('building', 'No hay sedes en esta vista')}</div>`;

    const find = (id) => tenants.find((x) => x.id === id);
    el.querySelectorAll('[data-enter]').forEach((b) => b.onclick = () => enter(b.dataset.enter));
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editSede(find(b.dataset.ed)));
    el.querySelectorAll('[data-renew]').forEach((b) => b.onclick = () => renew(find(b.dataset.renew)));
    el.querySelectorAll('[data-tog]').forEach((b) => b.onclick = () => toggleFreeze(find(b.dataset.tog)));
    el.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => {
      const t = find(b.dataset.restore);
      if (!(await confirmDialog({ title: 'Restaurar sede', message: `¿Restaurar <b>${esc(t.name)}</b>? Quedará activa otra vez.`, confirmText: 'Restaurar' }))) return;
      await updateTenant(t.id, { deleted: false, active: true, deletedAt: null });
      if (t.code && t.ownerEmail) await setUsername(t.code, { email: t.ownerEmail, uid: t.id, createdAt: nowISO() }).catch(() => {});
      Object.assign(t, { deleted: false, active: true }); render(); toast('Sede restaurada');
    });
  }

  async function toggleFreeze(t) {
    const freeze = t.active !== false;
    if (!freeze) {
      if (!(await confirmDialog({ title: 'Activar sede', message: `<b>${esc(t.name)}</b> recuperará el acceso inmediatamente.`, confirmText: 'Activar' }))) return;
      await updateTenant(t.id, { active: true, frozenReason: '' }); Object.assign(t, { active: true, frozenReason: '' }); render(); toast('Sede activada'); return;
    }
    const m = openModal({
      title: `Congelar ${esc(t.name)}`, sub: 'La sede no podrá entrar ni operar hasta que la actives. Sus datos se conservan.', size: 'sm',
      body: `<div class="field"><label>Motivo (lo verá la sede)</label><select class="select" data-r><option>Pago pendiente</option><option>Solicitud del cliente</option><option>Mantenimiento</option><option value="">Sin motivo</option></select></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" data-ok>${icon('lock')} Congelar</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const reason = m.el.querySelector('[data-r]').value;
      await updateTenant(t.id, { active: false, frozenReason: reason, frozenAt: nowISO() });
      Object.assign(t, { active: false, frozenReason: reason }); m.close(); render(); toast('Sede congelada', 'warning');
    };
  }

  async function renew(t) {
    const base = Math.max(Date.now(), ms(t.paidUntil) || 0);
    const next = addDays(new Date(base), 30);
    if (!(await confirmDialog({ title: 'Renovar plan', message: `Extender <b>${esc(t.name)}</b> 30 días, hasta el <b>${fmtDate(next.toISOString())}</b>?`, confirmText: 'Renovar' }))) return;
    await updateTenant(t.id, { paidUntil: Timestamp.fromDate(next), active: true, frozenReason: '', renewedAt: nowISO() });
    Object.assign(t, { paidUntil: Timestamp.fromDate(next), active: true }); render(); toast('Plan renovado');
  }

  function editSede(t) {
    const pu = t.paidUntil ? dayKey(new Date(ms(t.paidUntil))) : '';
    const m = openModal({
      title: `Editar ${esc(t.name)}`, sub: `Usuario: ${esc(t.code)} · ${esc(t.ownerEmail || '')}`, size: 'lg',
      body: `<form class="form-grid" data-f>
        <div class="field full"><label>Nombre de la sede</label><input class="input" name="name" value="${esc(t.name || '')}"></div>
        <div class="field"><label>Dueño / contacto</label><input class="input" name="ownerName" value="${esc(t.ownerName || '')}"></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="ownerPhone" value="${esc(t.ownerPhone || '')}"></div>
        <div class="field"><label>Plan</label><select class="select" name="plan">${PLANS.map((p) => `<option ${p === t.plan ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Pagado hasta</label><input class="input" type="date" name="paidUntil" value="${pu}"><span class="hint">Vacío = sin vencimiento. Al vencer, la sede se bloquea sola.</span></div>
        <div class="field full"><label>Notas internas</label><input class="input" name="notes" value="${esc(t.notes || '')}" placeholder="Solo las ves tú"></div>
      </form>
      <div class="divider mt-lg"></div>
      <div class="grid-2 mt">
        <button class="btn btn-secondary" data-pin>${icon('lock')} Reiniciar PIN</button>
        <button class="btn btn-secondary" data-share>${icon('whatsapp')} Enviar acceso</button>
      </div>
      <p class="hint mt">La contraseña de la sede solo la puede cambiar la sede (Configuración › Seguridad). Si la olvidó, crea un nuevo usuario y transfiere el nombre.</p>`,
      footer: `<button class="btn btn-danger-soft" data-del style="margin-right:auto">${icon('trash')} Eliminar sede</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      const patch = { name: F.name.value.trim() || t.name, ownerName: F.ownerName.value.trim(), ownerPhone: F.ownerPhone.value.trim(), plan: F.plan.value, notes: F.notes.value.trim(), paidUntil: F.paidUntil.value ? Timestamp.fromDate(new Date(fromKey(F.paidUntil.value).setHours(23, 59, 59))) : null, updatedAt: nowISO() };
      await updateTenant(t.id, patch);
      Object.assign(t, patch); m.close(); render(); toast('Sede actualizada');
    };
    m.el.querySelector('[data-pin]').onclick = async () => {
      const pin = genPin();
      if (!(await confirmDialog({ title: 'Reiniciar PIN', message: `El nuevo PIN de <b>${esc(t.name)}</b> será <b class="mono">${pin}</b>.`, confirmText: 'Reiniciar' }))) return;
      const b = writeBatch(db); b.set(doc(db, 'tenants', t.id, 'config', 'security'), { pinHash: await sha256(`${t.id}:${pin}`), updatedAt: nowISO() }, { merge: true }); await b.commit();
      toast(`PIN reiniciado: ${pin}`, 'success', 8000);
    };
    m.el.querySelector('[data-share]').onclick = () => {
      const text = `¡Hola${t.ownerName ? ' ' + t.ownerName : ''}! Tu acceso a SanoFarmacia:\n\nEnlace: ${APP_URL}\nUsuario: ${t.code}\n\nSi no recuerdas tu contraseña, escríbenos.`;
      window.open(t.ownerPhone ? waLink(t.ownerPhone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    };
    m.el.querySelector('[data-del]').onclick = async () => {
      const ok = await confirmDialog({ title: 'Eliminar sede', message: `¿Eliminar <b>${esc(t.name)}</b>? No podrá iniciar sesión. Puedes restaurarla luego desde “Eliminadas”, o borrar también todos sus datos (irreversible).`, confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      const purge = await confirmDialog({ title: '¿Borrar también sus datos?', message: 'Pacientes, productos y lotes, ventas, recetas, compras, caja y configuración se borrarán para siempre.', confirmText: 'Sí, borrar todo', cancelText: 'No, conservarlos', danger: true });
      m.close();
      toast('Eliminando sede…', 'info');
      await updateTenant(t.id, { deleted: true, active: false, deletedAt: nowISO() });
      if (t.code) await deleteUsername(t.code).catch(() => {});
      if (purge) { const { purgeTenant } = await import('../demo.js'); await purgeTenant(t.id, false); }
      Object.assign(t, { deleted: true, active: false }); render(); toast('Sede eliminada', 'warning');
    };
  }

  function newSedeModal() {
    const next = 'sede' + String(tenants.reduce((mx, t) => { const r = /^sede(\d+)$/.exec(t.code || ''); return r ? Math.max(mx, +r[1]) : mx; }, 0) + 1).padStart(2, '0');
    const m = openModal({
      title: 'Nueva sede', sub: 'Se crea la cuenta de acceso y el negocio queda listo y vacío.', size: 'lg',
      body: `<form class="form-grid" data-f autocomplete="off">
        <div class="field full"><label>Nombre del negocio *</label><input class="input" name="name" placeholder="Ej.: Farmacia Santa Rosa" autofocus></div>
        <div class="field"><label>Usuario *</label><input class="input" name="username" value="${next}" autocapitalize="off" spellcheck="false"><span class="hint">Con este nombre inicia sesión.</span></div>
        <div class="field"><label>Correo (opcional)</label><input class="input" name="email" placeholder="${next}@${DOMAIN}" inputmode="email"></div>
        <div class="field"><label>Contraseña *</label><div class="row"><input class="input" name="password" value="${genPass()}"><button type="button" class="btn btn-secondary btn-icon" data-gp>${icon('refresh')}</button></div></div>
        <div class="field"><label>PIN de administrador *</label><div class="row"><input class="input" name="pin" value="${genPin()}" inputmode="numeric" maxlength="12"><button type="button" class="btn btn-secondary btn-icon" data-gpin>${icon('refresh')}</button></div></div>
        <div class="field"><label>Dueño / contacto</label><input class="input" name="ownerName"></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="ownerPhone" placeholder="0414-1234567"></div>
        <div class="field"><label>Plan</label><select class="select" name="plan">${PLANS.map((p) => `<option>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Pagado hasta</label><input class="input" type="date" name="paidUntil" value="${dayKey(addDays(new Date(), 30))}"></div>
        <div class="error-msg full" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Crear sede</button>`
    });
    const F = m.el.querySelector('[data-f]').elements; const err = m.el.querySelector('[data-err]');
    m.el.querySelector('[data-gp]').onclick = () => { F.password.value = genPass(); };
    m.el.querySelector('[data-gpin]').onclick = () => { F.pin.value = genPin(); };
    F.username.oninput = () => { F.email.placeholder = `${F.username.value.trim().toLowerCase() || 'usuario'}@${DOMAIN}`; };
    const save = async (e) => {
      e?.preventDefault(); err.textContent = '';
      const name = F.name.value.trim(); const username = F.username.value.trim().toLowerCase();
      const email = (F.email.value.trim() || `${username}@${DOMAIN}`).toLowerCase();
      const password = F.password.value; const pin = F.pin.value.trim();
      if (!name) { err.textContent = 'Indica el nombre del negocio.'; return; }
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) { err.textContent = 'Usuario inválido: 3 a 30 caracteres (letras, números, punto o guion).'; return; }
      if (['admin', 'demo'].includes(username)) { err.textContent = 'Ese usuario está reservado.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Correo inválido.'; return; }
      if (password.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
      if (!/^\d{4,12}$/.test(pin)) { err.textContent = 'El PIN debe tener entre 4 y 12 dígitos.'; return; }
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Creando…');
      try {
        if (await getUsername(username)) throw new Error('Ese usuario ya está registrado.');
        await createSede({ name, username, email, password, pin, plan: F.plan.value, paidUntil: F.paidUntil.value ? new Date(fromKey(F.paidUntil.value).setHours(23, 59, 59)) : null, ownerName: F.ownerName.value.trim(), ownerPhone: F.ownerPhone.value.trim() });
        m.close();
        showCredentials({ name, username, email, password, pin, phone: F.ownerPhone.value.trim() });
        stats = {}; load();
      } catch (ex) {
        err.textContent = ex?.code === 'auth/email-already-in-use' ? 'Ese correo ya tiene una cuenta.' : ex?.code === 'auth/invalid-email' ? 'Correo inválido.' : (ex?.message || String(ex));
        setBusy(btn, false);
      }
    };
    m.el.querySelector('[data-f]').onsubmit = save;
    m.el.querySelector('[data-ok]').onclick = save;
  }

  function showCredentials(c) {
    const text = `¡Bienvenido a SanoFarmacia!\n\nNegocio: ${c.name}\nEnlace: ${APP_URL}\nUsuario: ${c.username}\nContraseña: ${c.password}\nPIN de administrador: ${c.pin}\n\nTe recomendamos cambiar la contraseña y el PIN en Configuración › Seguridad.`;
    const m = openModal({
      title: 'Sede creada', sub: 'Entrega estos datos al dueño de la farmacia. La contraseña no se volverá a mostrar.', size: 'sm',
      body: `<div class="summary-box">
        <div class="summary-row"><span class="muted">Negocio</span><b>${esc(c.name)}</b></div>
        <div class="summary-row"><span class="muted">Usuario</span><b>${esc(c.username)}</b></div>
        <div class="summary-row"><span class="muted">Correo</span><b style="word-break:break-all">${esc(c.email)}</b></div>
        <div class="summary-row"><span class="muted">Contraseña</span><b class="mono">${esc(c.password)}</b></div>
        <div class="summary-row"><span class="muted">PIN</span><b class="mono">${esc(c.pin)}</b></div>
      </div>`,
      footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><a class="btn btn-whatsapp" data-wa target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a><button class="btn btn-primary" data-close>Listo</button>`
    });
    m.el.querySelector('[data-wa]').href = c.phone ? waLink(c.phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text);
    m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Datos copiados'); } catch (_) { toast('No se pudo copiar', 'warning'); } };
  }

  async function announcement() {
    const a = (await getAnnouncement().catch(() => null)) || {};
    const m = openModal({
      title: 'Aviso para todas las sedes', sub: 'Aparece como una franja en la parte superior de la app de cada sede.', size: 'md',
      body: `<div class="stack"><div class="field"><label>Mensaje</label><textarea class="textarea" data-t placeholder="Ej.: Este domingo de 2 a 4 a. m. haremos mantenimiento.">${esc(a.text || '')}</textarea></div>
        <label class="check"><span class="switch"><input type="checkbox" data-on ${a.active ? 'checked' : ''}><span></span></span> Mostrar aviso</label></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Publicar</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      await setAnnouncement({ text: m.el.querySelector('[data-t]').value.trim(), active: m.el.querySelector('[data-on]').checked, updatedAt: nowISO() });
      m.close(); toast('Aviso publicado');
    };
  }

  $('#a-new').onclick = newSedeModal;
  $('#a-ann').onclick = announcement;
  $('#a-out').onclick = () => logout();
  $('#a-theme').onclick = (e) => { const n = toggleTheme(); e.currentTarget.innerHTML = icon(n === 'dark' ? 'sun' : 'moon'); };
  $('#a-refresh').onclick = () => { stats = {}; load(); };
  $('#a-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  $('#a-csv').onclick = () => download('sedes-sano-farmacia.csv', toCSV([['Sede', 'Usuario', 'Correo', 'Estado', 'Plan', 'Pagado hasta', 'Dueño', 'Teléfono', 'Cobrado hoy', 'Citas hoy', 'Creada'],
    ...tenants.map((t) => [t.name, t.code, t.ownerEmail, status(t).label, t.plan || '', t.paidUntil ? fmtDate(new Date(ms(t.paidUntil)).toISOString()) : '', t.ownerName || '', t.ownerPhone || '', (stats[t.id]?.total || 0).toFixed(2), stats[t.id]?.open ?? '', fmtDate(t.createdAt)])]));
  load();
  return () => { alive = false; };
}
