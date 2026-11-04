// SanoFarmacia — Arranque, inicio de sesión, estructura y navegación
import { auth, onAuthStateChanged } from './firebase.js';
import { store, getTenant } from './store.js';
import { session, login, logout, authErrorMessage, SUPER_EMAIL, usernameOf } from './auth.js';
import { esc, toast, closeAllModals, $, $$, setBusy, confirmDialog, toggleTheme, openModal, fmtDate, loc, flagImg, debounce, todayKey } from './utils.js';
import { icon } from './icons.js';
import { openCountryPicker, salesWa, SALES_PHONE_FMT } from './shared.js';
import { isStandalone, platform, bindInstallButtons } from './install.js';

export const VERSION = '1.0.0';

const ROUTES = {
  inicio: { title: 'Inicio', icon: 'home', group: 'Farmacia', load: () => import('./views/dashboard.js') },
  vender: { title: 'Vender', icon: 'cart', group: 'Farmacia', full: true, load: () => import('./views/pos.js') },
  pedidos: { title: 'Pedidos en línea', icon: 'bag', group: 'Farmacia', load: () => import('./views/orders.js') },
  pacientes: { title: 'Pacientes', icon: 'users', group: 'Farmacia', load: () => import('./views/clients.js') },
  recetas: { title: 'Recetas y controlados', icon: 'file', group: 'Farmacia', load: () => import('./views/rx.js') },
  fidelizar: { title: 'Recompras y fidelidad', icon: 'heart', group: 'Farmacia', load: () => import('./views/loyalty.js') },
  inventario: { title: 'Inventario y lotes', icon: 'box', group: 'Inventario', load: () => import('./views/inventory.js') },
  compras: { title: 'Compras y proveedores', icon: 'truck', group: 'Inventario', load: () => import('./views/purchases.js') },
  facturas: { title: 'Facturación', icon: 'receipt', group: 'Administración', load: () => import('./views/invoices.js') },
  caja: { title: 'Caja', icon: 'wallet', group: 'Administración', load: () => import('./views/cash.js') },
  reportes: { title: 'Reportes', icon: 'chart', group: 'Administración', pin: true, load: () => import('./views/reports.js') },
  ajustes: { title: 'Configuración', icon: 'settings', group: 'Sistema', load: () => import('./views/settings.js') },
  precios: { title: 'Consulta de precios', icon: 'barcode', hidden: true, kiosk: true, load: () => import('./views/kiosk.js') }
};

let currentRoute = null;
let currentCleanup = null;
let storeUnsub = null;
let routeParams = {};

// Páginas públicas (sin sesión): tarjeta del paciente y pedido en línea
const PUBLIC_CARD = /^\/tarjeta(\/|$)/i.test(location.pathname);
const PUBLIC_SHOP = /^\/pedido(\/|$)/i.test(location.pathname);

const root = () => document.getElementById('root');
function hideBoot() {
  const b = document.getElementById('boot');
  if (b) { b.style.opacity = '0'; b.style.pointerEvents = 'none'; setTimeout(() => b.remove(), 300); }
}
function showBoot() {
  if (document.getElementById('boot')) return;
  const b = document.createElement('div');
  b.id = 'boot'; b.className = 'boot';
  b.innerHTML = '<div class="boot-inner"><img src="/assets/icon-192.png" alt=""><div class="spinner"></div></div>';
  document.body.appendChild(b);
}

// ======================================================================
// LOGIN
// ======================================================================
function renderLogin() {
  teardownApp();
  root().innerHTML = `
    <div class="auth-screen">
      <section class="auth-hero">
        <div class="auth-deco" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="auth-brand"><img src="/assets/logo.svg" alt=""><div>SanoFarmacia<small>Gestión profesional para farmacias</small></div></div>
        <div style="position:relative;z-index:1">
          <h1>Tu farmacia en orden, <em>tus pacientes de vuelta.</em></h1>
          <p>Vende por caja, blíster o unidad con lector de código de barras, controla lotes y vencimientos sin perder mercancía, lleva el libro de recetas y controlados, y avísale a cada paciente antes de que se le acabe su tratamiento. Cobros en la moneda de tu país.</p>
          <div class="auth-features">
            <div class="auth-feature"><span>${icon('barcode')}</span>Punto de venta con lector y venta fraccionada</div>
            <div class="auth-feature"><span>${icon('calendar')}</span>Lotes y vencimientos con alertas a 30/60/90 días</div>
            <div class="auth-feature"><span>${icon('file')}</span>Libro de recetas, antibióticos y controlados</div>
            <div class="auth-feature"><span>${icon('pill')}</span>Recompra de tratamientos crónicos por WhatsApp</div>
            <div class="auth-feature"><span>${icon('truck')}</span>Compras a droguerías, recepción por lote y cuentas por pagar</div>
            <div class="auth-feature"><span>${icon('bag')}</span>Catálogo en línea para pedidos y delivery · 20 países</div>
          </div>
        </div>
        <div class="small" style="color:rgba(255,255,255,.55);position:relative;z-index:1">© ${new Date().getFullYear()} SanoFarmacia · Instálalo desde Chrome en tu teléfono o computadora</div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <div class="auth-mobile-brand"><img src="/assets/logo.svg" alt=""> SanoFarmacia</div>
          <h2>Bienvenido</h2>
          <p class="muted" style="margin:0">Ingresa con el usuario de tu farmacia.</p>
          <form class="stack mt-lg" id="login-form" autocomplete="on">
            <div class="field">
              <label for="lg-user">Usuario o correo</label>
              <input class="input" id="lg-user" name="username" autocomplete="username" placeholder="ej. sede01" autocapitalize="off" spellcheck="false" required>
            </div>
            <div class="field">
              <label for="lg-pass">Contraseña</label>
              <div class="input-group">
                <input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required style="padding-right:44px">
                <button type="button" class="btn btn-ghost btn-icon btn-sm suffix-btn" id="lg-eye" aria-label="Mostrar contraseña">${icon('eye')}</button>
              </div>
            </div>
            <div class="error-msg" id="lg-err"></div>
            <button class="btn btn-primary btn-lg btn-block" id="lg-btn" type="submit">${icon('lock')} Entrar</button>
          </form>
          <div class="auth-or"><span>¿Quieres conocerlo?</span></div>
          <button class="btn btn-demo btn-lg btn-block" id="lg-demo" type="button">${icon('sparkle')} Probar demo gratis · 30 min</button>
          <p class="hint center mt">Sin registro. Incluye una farmacia de ejemplo con inventario, lotes, pacientes, recetas, pedidos y ventas; se borra al terminar. PIN de la demo: <b>1234</b>.</p>
          <a class="btn btn-whatsapp btn-lg btn-block mt" id="lg-wa" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} Contratar SanoFarmacia</a>
          <p class="hint center mt">WhatsApp: <b>${SALES_PHONE_FMT}</b></p>
          <button type="button" class="btn btn-ghost btn-block" id="lg-card">${icon('qr')} Soy paciente: ver mi tarjeta</button>
          ${isStandalone() ? '' : `<div class="install-card mt">
            <img src="/assets/icon-192.png" alt="">
            <div class="grow"><b>Instala la app</b><span>${platform() === 'desktop' ? 'Acceso directo en tu computadora' : 'Ícono en tu teléfono'}, sin tiendas ni descargas.</span></div>
            <button type="button" class="btn btn-primary btn-sm" data-install>${icon('install')} Instalar</button>
          </div>`}
          <p class="auth-foot">¿Olvidaste tu contraseña? Escríbenos por WhatsApp.</p>
        </div>
      </section>
    </div>`;
  hideBoot();
  const eye = $('#lg-eye');
  eye.onclick = () => {
    const p = $('#lg-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    eye.innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeOff');
  };
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#lg-btn'); const err = $('#lg-err');
    err.textContent = '';
    setBusy(btn, true, 'Verificando…');
    try {
      await login($('#lg-user').value, $('#lg-pass').value);
    } catch (ex) {
      err.textContent = authErrorMessage(ex);
      const p = $('#lg-pass'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      setBusy(btn, false);
    }
  };
  $('#lg-demo').onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Preparando tu farmacia de prueba…');
    try {
      const { startDemo } = await import('./demo.js');
      await startDemo();
    } catch (ex) {
      $('#lg-err').textContent = ex?.code === 'auth/operation-not-allowed' ? 'La demo no está disponible en este momento.' : authErrorMessage(ex);
      setBusy(btn, false);
    }
  };
  $('#lg-card').onclick = () => {
    const m = openModal({
      title: 'Mi tarjeta', sub: 'Escribe el código que aparece debajo del QR de tu tarjeta (o pídelo en tu farmacia).', size: 'sm',
      body: `<form class="stack" data-f><input class="input input-lg center mono" data-c maxlength="8" placeholder="Ej.: K7P3QXZ2" autocapitalize="characters" autofocus style="letter-spacing:.2em;text-transform:uppercase"></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('search')} Ver tarjeta</button>`
    });
    const go = (ev) => { ev?.preventDefault(); const c = m.el.querySelector('[data-c]').value.trim().toUpperCase(); if (c.length >= 4) location.href = '/tarjeta/' + encodeURIComponent(c); };
    m.el.querySelector('[data-f]').onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  };
  bindInstallButtons(root());
  setTimeout(() => $('#lg-user')?.focus(), 50);
  if (demoEndedNotice) showDemoEnded();
}

// ======================================================================
// SESIÓN
// ======================================================================
if (PUBLIC_CARD || PUBLIC_SHOP) {
  import(PUBLIC_CARD ? './views/card.js' : './views/shop.js').then((m) => { m.mount(root()); hideBoot(); }).catch((e) => { console.error(e); hideBoot(); });
} else {
  onAuthStateChanged(auth, async (user) => {
    session.user = user;
    if (!user) { renderLogin(); return; }
    session.isSuper = user.email === SUPER_EMAIL;
    showBoot();
    try {
      if (user.isAnonymous) await enterDemo(user);
      else if (session.isSuper) {
        const viewing = sessionStorage.getItem('sf_view_tenant');
        if (viewing) await enterTenant(viewing); else await renderAdminPanel();
      } else await enterTenant(user.uid);
    } catch (e) {
      console.error(e);
      renderError(e);
    }
  });
}

function centerCard(inner) {
  teardownApp();
  root().innerHTML = `<div class="auth-screen" style="grid-template-columns:1fr"><section class="auth-panel"><div class="auth-card center">${inner}</div></section></div>`;
  hideBoot();
}

function renderError(e) {
  centerCard(`
    <div class="kpi-icon tone-danger" style="margin:0 auto 12px;width:56px;height:56px">${icon('alert')}</div>
    <h2>No se pudo abrir la farmacia</h2>
    <p class="muted mt">${esc(e?.message || e)}</p>
    <button class="btn btn-primary btn-block mt-lg" id="err-retry">Reintentar</button>
    <button class="btn btn-ghost btn-block mt" id="err-out">Cerrar sesión</button>`);
  $('#err-retry').onclick = () => location.reload();
  $('#err-out').onclick = () => logout();
}

function renderBlocked(t, kind) {
  const texts = {
    frozen: ['Cuenta congelada', `El acceso de <b>${esc(t?.name || 'tu farmacia')}</b> está temporalmente congelado${t?.frozenReason ? ': ' + esc(t.frozenReason) : '.'} Tus datos están a salvo.`],
    expired: ['Tu plan venció', `El plan de <b>${esc(t?.name || 'tu farmacia')}</b> venció el ${fmtDate(paidUntilISO(t))}. Renuévalo para seguir trabajando; tus datos están a salvo.`],
    missing: ['Cuenta sin farmacia asignada', 'Esta cuenta no tiene una farmacia activa en SanoFarmacia. Contáctanos para activarla.']
  }[kind];
  centerCard(`
    <div class="kpi-icon tone-warning" style="margin:0 auto 12px;width:56px;height:56px">${icon('lock')}</div>
    <h2>${texts[0]}</h2>
    <p class="muted mt">${texts[1]}</p>
    <a class="btn btn-whatsapp btn-lg btn-block mt-lg" href="${salesWa(`Hola, necesito ayuda con mi cuenta de SanoFarmacia (${t?.code || session.user?.email || ''}).`)}" target="_blank" rel="noopener">${icon('whatsapp')} Escríbenos por WhatsApp</a>
    <p class="hint center mt">${SALES_PHONE_FMT}</p>
    <button class="btn btn-secondary btn-block mt" id="blk-out">Cerrar sesión</button>`);
  $('#blk-out').onclick = () => logout();
}
const tsMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ? new Date(v).getTime() : 0);
const paidUntilISO = (t) => (t?.paidUntil ? new Date(tsMillis(t.paidUntil)).toISOString() : null);
function tenantState(t) {
  if (!t || t.deleted) return 'missing';
  if (t.active === false) return 'frozen';
  if (t.paidUntil && tsMillis(t.paidUntil) < Date.now()) return 'expired';
  return 'ok';
}

async function enterTenant(tenantId) {
  let t = null;
  try { t = await getTenant(tenantId); } catch (e) { if (e?.code !== 'unavailable' && e?.code !== 'permission-denied') throw e; }
  if (session.isSuper && !t) { sessionStorage.removeItem('sf_view_tenant'); await renderAdminPanel(); return; }
  const st = tenantState(t);
  if (st !== 'ok' && !session.isSuper) { renderBlocked(t, st); return; }
  if (session.isSuper) sessionStorage.setItem('sf_view_tenant', tenantId);

  await store.start(tenantId);
  renderShell();
  const hash = location.hash.replace(/^#\/?/, '');
  navigate(ROUTES[hash] ? hash : 'inicio', { replace: true });
  hideBoot();
  afterEnter();
}

/** La primera vez que se entra se elige el país: define moneda, formas de pago y WhatsApp */
async function ensureCountry() {
  if (store.country) return;
  await openCountryPicker({ force: true });
  if (store.country) { renderShell(); navigate(currentRoute || 'inicio', { replace: true, force: true }); }
}
/** Enlace del catálogo en línea: se crea solo la primera vez (nombre-de-la-farmacia-xxxx) */
async function ensureShopSlug() {
  if (store.settings.shop?.slug || session.isSuper) return;
  const { slugify, genCode } = await import('./ops.js');
  const slug = `${slugify(store.businessName)}-${genCode(4).toLowerCase()}`;
  await store.saveSettings({ shop: { ...store.settings.shop, slug } }).catch(() => {});
}
async function afterEnter() {
  await ensureCountry();
  await ensureShopSlug();
  startPublisher();
}

// Mantiene al día el catálogo público (precios y disponibilidad) mientras la app está abierta
let pubOff = null;
function startPublisher() {
  pubOff?.();
  if (session.isSuper && !store.isDemo) return;
  import('./ops.js').then(({ publishShop, resetPublished }) => {
    resetPublished();
    const run = debounce(() => publishShop().catch((e) => console.warn('[catálogo]', e?.code || e)), 4000);
    run();
    const offs = [store.on('products', run), store.on('settings', run)];
    const iv = setInterval(run, 10 * 60000);
    pubOff = () => { offs.forEach((o) => o()); clearInterval(iv); pubOff = null; };
  });
}

// ======================================================================
// DEMO
// ======================================================================
let demoTimer = null;
let demoEndedNotice = false;
async function enterDemo(user) {
  const demo = await import('./demo.js');
  let t = null;
  try { t = await getTenant(user.uid); } catch (_) {}
  if (!t) {
    await demo.createDemoTenant(user.uid);
    await store.start(user.uid);
    hideBoot();
    await ensureCountry();
    showBoot();
    await demo.seedDemoActivity();
  } else {
    if (demo.demoRemainingMs(t) <= 0) { await endDemo(true); return; }
    await store.start(user.uid);
  }
  renderShell();
  navigate('inicio', { replace: true, force: true });
  hideBoot();
  startDemoTimer();
  await ensureCountry();
  await ensureShopSlug();
  startPublisher();
  if (!t) setTimeout(() => import('./tour.js').then((m) => m.startTour('general')), 700);
}

function startDemoTimer() {
  clearInterval(demoTimer);
  const tick = async () => {
    const { demoRemainingMs } = await import('./demo.js');
    const ms = demoRemainingMs(store.tenant);
    const el = document.getElementById('demo-left');
    if (ms <= 0) { clearInterval(demoTimer); await endDemo(false); return; }
    if (el) {
      const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
      el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
      el.closest('.demo-clock')?.classList.toggle('demo-ending', ms < 5 * 60000);
    }
    if (ms < 5 * 60000 && ms > 4 * 60000 + 58000) toast('Quedan 5 minutos de demo.', 'warning', 4000);
  };
  tick();
  demoTimer = setInterval(tick, 1000);
}

async function endDemo(silent) {
  clearInterval(demoTimer);
  const tenantId = auth.currentUser?.uid;
  const slug = store.settings.shop?.slug;
  pubOff?.();
  teardownApp();
  store.stop();
  showBoot();
  if (!silent) demoEndedNotice = true;
  const { cleanupDemo } = await import('./demo.js');
  if (tenantId) await cleanupDemo(tenantId, slug);
  if (auth.currentUser) await logout().catch(() => {});
}
function showDemoEnded() {
  demoEndedNotice = false;
  openModal({
    title: 'Tu demo terminó', size: 'sm',
    body: `<div class="stack"><p class="muted" style="margin:0">Los datos de prueba se eliminaron.</p>
      <p style="margin:0">¿Te gustó SanoFarmacia? Escríbenos al <b>${SALES_PHONE_FMT}</b> y activa la cuenta de tu farmacia con tus propios datos.</p></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cerrar</button><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} Escríbenos</a>`
  });
}

// ======================================================================
// PANEL DEL ADMINISTRADOR
// ======================================================================
async function renderAdminPanel() {
  teardownApp();
  pubOff?.();
  store.stop();
  root().innerHTML = '<div id="admin-root"></div>';
  const mod = await import('./views/admin.js');
  currentCleanup = mod.mount($('#admin-root'), {
    enter: async (id) => { showBoot(); sessionStorage.setItem('sf_view_tenant', id); location.hash = '#/inicio'; await enterTenant(id); },
    logout: () => logout()
  });
  hideBoot();
}

// ======================================================================
// ESTRUCTURA
// ======================================================================
function navItems() {
  const groups = {};
  for (const [id, r] of Object.entries(ROUTES)) if (!r.hidden) (groups[r.group] ||= []).push([id, r]);
  return Object.entries(groups).map(([g, items]) => `
    <div class="sb-section">${g}</div>
    ${items.map(([id, r]) => `<button class="nav-item" data-nav="${id}">${icon(r.icon)}<span>${r.title}</span><span class="nav-badge" data-badge="${id}" hidden></span></button>`).join('')}
  `).join('') + `<button class="nav-item" data-nav="precios">${icon('barcode')}<span>Consulta de precios</span></button><button class="nav-item" id="sb-help">${icon('info')}<span>Ayuda y recorridos</span></button>`;
}

function planWarning() {
  const t = store.tenant;
  if (!t?.paidUntil || session.isSuper) return '';
  const days = Math.ceil((tsMillis(t.paidUntil) - Date.now()) / 86400000);
  if (days > 5) return '';
  return `<div class="banner offline-banner"><span>${icon('clock')} Tu plan vence ${days <= 0 ? 'hoy' : `en ${days} día(s)`} (${fmtDate(paidUntilISO(t))}).</span><a class="btn btn-sm btn-whatsapp" href="${salesWa('Hola, quiero renovar mi plan de SanoFarmacia.')}" target="_blank" rel="noopener">${icon('whatsapp')} Renovar</a></div>`;
}

function renderShell() {
  teardownApp();
  const tName = store.tenant?.name || store.businessName;
  root().innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="sb-brand"><img src="/assets/logo.svg" alt=""><div><b>SanoFarmacia</b><small>Gestión de farmacias</small></div></div>
        <div class="sb-tenant"><div class="xs">Farmacia</div><b id="sb-tenant-name">${esc(tName)}</b><div class="sb-live" id="sb-live"></div></div>
        <button class="sb-search" id="sb-search">${icon('search')}<span>Buscar producto, paciente, factura…</span><kbd>Ctrl K</kbd></button>
        <nav class="sb-nav">${navItems()}</nav>
        <div class="sb-foot">
          <button class="rate-pill" id="sb-rate" title="País y moneda de trabajo"><span>${flagImg(loc().code)} ${esc(loc().name)}</span><b id="sb-rate-val">${esc(loc().cur)} · ${esc(loc().sym)}</b></button>
          <div class="between">
            <div class="sb-status"><span class="dot" id="sb-dot"></span><span id="sb-net">En línea</span></div>
            <div class="row">
              ${isStandalone() ? '' : `<button class="sb-btn" data-install title="Instalar la app en este equipo">${icon('install')} Instalar</button>`}
              <button class="sb-btn" id="sb-theme" title="Cambiar tema" style="padding:6px 8px">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            </div>
          </div>
          <div class="sb-user"><span title="${esc(session.user?.email || '')}">${esc(session.user?.isAnonymous ? 'Invitado (demo)' : usernameOf(session.user?.email))}</span><button class="sb-btn" id="sb-logout">${icon('logout')} Salir</button></div>
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sb-backdrop"></div>
      <div class="main">
        ${session.isSuper ? `<div class="banner admin-banner"><span>${icon('shield')} Modo administrador · <b>${esc(tName)}</b></span><button id="ab-back">← Volver al panel de sedes</button></div>` : ''}
        ${store.isDemo ? `<div class="banner demo-banner"><span>${icon('sparkle')} <b>Modo demo</b><span class="hide-sm"> · datos de ejemplo, se borran al terminar</span> · PIN <b>1234</b></span><span class="demo-clock">${icon('clock')} <b id="demo-left">30:00</b><button id="demo-end">Terminar</button></span></div>` : ''}
        ${planWarning()}
        <div id="announce"></div>
        <div class="offline-banner" id="offline-banner" hidden>Sin conexión: puedes seguir vendiendo, se sincroniza al volver internet.</div>
        <header class="topbar">
          <button class="btn btn-ghost btn-icon" id="tb-menu" aria-label="Menú">${icon('menu')}</button>
          <img src="/assets/logo.svg" alt="">
          <div class="grow" style="min-width:0"><div class="tb-title ellipsis" id="tb-title">SanoFarmacia</div><div class="tb-sub ellipsis">${esc(tName)}</div></div>
          <button class="btn btn-ghost btn-icon" id="tb-search" aria-label="Buscar">${icon('search')}</button>
          ${isStandalone() ? '' : `<button class="btn btn-ghost btn-icon" data-install aria-label="Instalar app" title="Instalar app">${icon('install')}</button>`}
          <button class="rate-mini" id="tb-rate" title="${esc(loc().name)}">${flagImg(loc().code)} ${esc(loc().cur)}</button>
        </header>
        <main class="content" id="view"></main>
      </div>
      <nav class="bottom-nav">
        <button data-nav="inicio">${icon('home')}Inicio</button>
        <button data-nav="vender">${icon('cart')}Vender</button>
        <button data-nav="pedidos">${icon('bag')}Pedidos<span class="bn-badge" data-badge-m="pedidos" hidden></span></button>
        <button data-nav="inventario">${icon('box')}Inventario<span class="bn-badge" data-badge-m="inventario" hidden></span></button>
        <button data-nav="pacientes">${icon('users')}Pacientes</button>
        <button id="bn-more">${icon('menu')}Más<span class="bn-badge" data-badge-m="fidelizar" hidden></span></button>
      </nav>
    </div>`;

  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { navigate(b.dataset.nav); closeSidebar(); }));
  $('#tb-menu').onclick = openSidebar;
  $('#sb-help').onclick = () => { closeSidebar(); import('./tour.js').then((t) => t.openHelp()); };
  $('#bn-more').onclick = openSidebar;
  $('#sb-backdrop').onclick = closeSidebar;
  const pickCountry = async () => { const { requirePin } = await import('./auth.js'); if (!(await requirePin('Cambiar el país y la moneda'))) return; if (await openCountryPicker()) { renderShell(); navigate(currentRoute || 'inicio', { replace: true, force: true }); } };
  $('#sb-rate').onclick = pickCountry;
  $('#tb-rate').onclick = pickCountry;
  $('#sb-search').onclick = () => { closeSidebar(); openSearch(); };
  $('#tb-search').onclick = openSearch;
  $('#sb-logout').onclick = async () => {
    if (store.isDemo) { if (await confirmDialog({ title: 'Terminar demo', message: 'Se cerrará la sesión y se borrarán los datos de esta demo.', confirmText: 'Terminar', danger: true })) endDemo(false); return; }
    if (await confirmDialog({ title: 'Cerrar sesión', message: '¿Deseas salir de SanoFarmacia en este dispositivo?', confirmText: 'Salir' })) logout();
  };
  $('#sb-theme').onclick = toggleTheme;
  if (store.isDemo) $('#demo-end').onclick = async () => {
    if (await confirmDialog({ title: 'Terminar demo', message: 'Se cerrará la sesión y se borrarán los datos de esta demo.', confirmText: 'Terminar', danger: true })) endDemo(false);
  };
  if (session.isSuper) $('#ab-back').onclick = () => { sessionStorage.removeItem('sf_view_tenant'); location.hash = ''; showBoot(); renderAdminPanel(); };
  bindInstallButtons(root());

  storeUnsub = store.on('*', (evt) => {
    if (evt === 'settings' || evt === 'rate') {
      $('#sb-rate-val') && ($('#sb-rate-val').textContent = `${loc().cur} · ${loc().sym}`);
      $('#tb-rate') && ($('#tb-rate').innerHTML = `${flagImg(loc().code)} ${loc().cur}`);
    }
    if (evt === 'tenant') {
      $('#sb-tenant-name') && ($('#sb-tenant-name').textContent = store.tenant?.name || store.businessName);
      const st = tenantState(store.tenant);
      if (st !== 'ok' && !session.isSuper && !store.isDemo) renderBlocked(store.tenant, st);
    }
    if (['products', 'clients', 'orders', 'payables', 'settings'].includes(evt)) updateBadges();
    if (evt === 'orders') notifyOrders();
    if (evt === 'announcement') renderAnnouncement();
    if (evt === 'denied' && !session.isSuper) toast('Acceso denegado a los datos de la farmacia.', 'danger', 5000);
  });
  updateBadges();
  renderAnnouncement();
  updateNetwork();
}

function setBadge(id, n, cls = '') {
  const b = document.querySelector(`[data-badge="${id}"]`);
  if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; b.className = 'nav-badge ' + cls; }
  const m = document.querySelector(`[data-badge-m="${id}"]`);
  if (m) { m.hidden = !n; m.textContent = n > 99 ? '99+' : n; }
}
function updateBadges() {
  const exp = store.expiringProducts.length;
  setBadge('inventario', store.lowProducts.length + exp, store.outProducts.length || store.expiredLots.length ? '' : 'warn');
  setBadge('pedidos', store.newOrders.length, 'info');
  setBadge('fidelizar', store.dueRefills.length, 'warn');
  setBadge('compras', store.payables.filter((p) => p.dueDate && p.dueDate <= todayKey()).length, '');
  const live = $('#sb-live');
  if (live) live.innerHTML = `<span class="live-dot"></span>${store.pendingOrders.length} pedido(s) · ${exp} por vencer`;
}
setInterval(() => { if (document.getElementById('sb-live')) updateBadges(); }, 60000);

let seenOrders = null;
function notifyOrders() {
  const ids = new Set(store.newOrders.map((r) => r.id));
  if (seenOrders) {
    const fresh = store.newOrders.filter((r) => !seenOrders.has(r.id));
    if (fresh.length) toast(`Nuevo pedido en línea de ${fresh[0].name} (${fresh[0].items?.length || 0} producto/s)`, 'info', 7000);
  }
  seenOrders = ids;
}

function renderAnnouncement() {
  const el = $('#announce');
  if (!el) return;
  const a = store.announcement;
  let dismissed = '';
  try { dismissed = localStorage.getItem('sf_announce') || ''; } catch (_) {}
  if (!a?.active || !a.text || dismissed === a.updatedAt) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner announce-banner"><span>${icon('bell')} ${esc(a.text)}</span><button id="an-x" aria-label="Cerrar aviso">${icon('x')}</button></div>`;
  $('#an-x').onclick = () => { try { localStorage.setItem('sf_announce', a.updatedAt); } catch (_) {} el.innerHTML = ''; };
}

function openSidebar() { $('#sidebar')?.classList.add('open'); $('#sb-backdrop')?.classList.add('open'); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('#sb-backdrop')?.classList.remove('open'); }

function teardownApp() {
  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error(e); } }
  currentCleanup = null; currentRoute = null;
  if (storeUnsub) { storeUnsub(); storeUnsub = null; }
  document.body.classList.remove('kiosk-mode');
  closeAllModals();
}

function openSearch() { import('./views/search.js').then((m) => m.openSearch()); }

// ======================================================================
// NAVEGACIÓN
// ======================================================================
let navToken = 0;
export async function navigate(id, { replace = false, force = false, params = {} } = {}) {
  if (!ROUTES[id]) id = 'inicio';
  if (!document.getElementById('view')) return;
  if (id === currentRoute && !force && !Object.keys(params).length) return;
  const route = ROUTES[id];
  if (route.pin) {
    const { requirePin } = await import('./auth.js');
    if (!(await requirePin(`Acceder a ${route.title}`))) {
      if (!currentRoute) navigate('inicio', { replace: true });
      else history.replaceState(null, '', '#/' + currentRoute);
      return;
    }
  }
  const token = ++navToken;
  closeAllModals();
  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error(e); } currentCleanup = null; }
  currentRoute = id;
  routeParams = params;
  const url = '#/' + id;
  if (replace) history.replaceState(null, '', url); else if (location.hash !== url) history.pushState(null, '', url);
  $$('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
  const tt = $('#tb-title'); if (tt) tt.textContent = route.title;
  document.title = `${route.title} · SanoFarmacia`;
  document.body.classList.toggle('kiosk-mode', !!route.kiosk);
  const view = $('#view');
  view.className = 'content' + (route.full ? ' full' : '') + (route.kiosk ? ' kiosk-view' : '');
  view.closest('.main')?.classList.toggle('main-fixed', !!route.full);
  view.innerHTML = '<div class="empty"><div class="spinner" style="margin:40px auto"></div></div>';
  try {
    const mod = await route.load();
    if (token !== navToken) return;
    view.innerHTML = '';
    window.scrollTo(0, 0);
    currentCleanup = mod.mount(view, { navigate, params: routeParams }) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card">${esc('No se pudo cargar la sección: ' + (e?.message || e))}</div>`;
  }
}

window.addEventListener('popstate', () => {
  const id = location.hash.replace(/^#\/?/, '');
  if (document.getElementById('view') && ROUTES[id] && id !== currentRoute) navigate(id, { replace: true });
});

window.addEventListener('keydown', (e) => {
  if (!document.getElementById('view') || document.body.classList.contains('kiosk-mode')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'F1') { e.preventDefault(); navigate('vender'); }
  if (e.key === 'F2') { e.preventDefault(); navigate('inventario'); }
  if (e.key === 'F3') { e.preventDefault(); navigate('pacientes'); }
  if (e.key === 'F4') { e.preventDefault(); navigate('pedidos'); }
});

// ======================================================================
// RED, PWA
// ======================================================================
function updateNetwork() {
  const on = navigator.onLine;
  const dot = $('#sb-dot'); const net = $('#sb-net'); const ban = $('#offline-banner');
  if (dot) dot.classList.toggle('off', !on);
  if (net) net.textContent = on ? 'En línea' : 'Sin conexión';
  if (ban) ban.hidden = on;
}
window.addEventListener('online', () => { updateNetwork(); toast('Conexión restablecida. Sincronizando…', 'info'); });
window.addEventListener('offline', updateNetwork);

if ('serviceWorker' in navigator && !sessionStorage.getItem('sf_emu')) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión disponible. Se aplicará al recargar.', 'info', 6000);
      });
    });
  }).catch((e) => console.warn('SW', e));
}
