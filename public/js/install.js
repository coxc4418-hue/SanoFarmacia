// SanoFarmacia — Instalación de la app desde el navegador (Android, PC e iPhone)
import { openModal, toast } from './utils.js';
import { icon } from './icons.js';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) {} });

// Chrome/Edge avisan cuando la app se puede instalar: guardamos el aviso para usarlo con nuestro botón
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
window.addEventListener('appinstalled', () => {
  deferred = null;
  try { localStorage.setItem('sf_installed', '1'); } catch (_) {}
  notify();
  toast('¡SanoFarmacia quedó instalado! Búscalo en tu pantalla de inicio o escritorio.', 'success', 6000);
});
matchMedia('(display-mode: standalone)').addEventListener?.('change', notify);

/** true si se está usando la app instalada (ventana propia) */
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
}
export function canPrompt() { return !!deferred; }
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
const browser = () => {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'tu navegador';
};

/** Instala con el diálogo nativo si está disponible; si no, muestra los pasos para este dispositivo. */
export async function installApp() {
  if (isStandalone()) { toast('Ya estás usando la app instalada.', 'info'); return; }
  if (deferred) {
    const e = deferred;
    deferred = null;
    e.prompt();
    const choice = await e.userChoice.catch(() => null);
    notify();
    if (choice?.outcome === 'accepted') return;
    return;
  }
  showSteps();
}

function step(n, html) { return `<div class="row" style="align-items:flex-start;gap:12px"><span class="badge badge-brand" style="height:26px;min-width:26px;justify-content:center;font-size:13px">${n}</span><div style="padding-top:3px">${html}</div></div>`; }

function showSteps() {
  const p = platform(); const b = browser();
  let steps;
  if (p === 'ios') {
    steps = [
      b === 'Safari' ? 'Estás en Safari. ¡Perfecto!' : 'Abre esta página en <b>Safari</b> (en iPhone solo Safari permite instalar).',
      'Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).',
      'Elige <b>“Agregar a inicio”</b> y luego <b>Agregar</b>.'
    ];
  } else if (p === 'android') {
    steps = [
      b === 'Chrome' ? 'Estás en Chrome. ¡Perfecto!' : 'Abre <b>sano-farmacia.web.app</b> en <b>Google Chrome</b>.',
      'Toca el menú <b>⋮</b> (arriba a la derecha).',
      'Toca <b>“Instalar app”</b> o <b>“Agregar a la pantalla principal”</b> y confirma.'
    ];
  } else {
    steps = [
      b === 'Chrome' || b === 'Edge' ? `Estás en ${b}. ¡Perfecto!` : 'Abre <b>sano-farmacia.web.app</b> en <b>Google Chrome</b> o <b>Microsoft Edge</b>.',
      'En la barra de direcciones, haz clic en el ícono de <b>instalar</b> (una pantalla con una flecha) a la derecha.',
      `O abre el menú <b>⋮</b> › <b>${b === 'Edge' ? 'Aplicaciones › Instalar este sitio como aplicación' : 'Transmitir, guardar y compartir › Instalar página como app'}</b>.`
    ];
  }
  let installed = false;
  try { installed = localStorage.getItem('sf_installed') === '1'; } catch (_) {}
  openModal({
    title: 'Instalar SanoFarmacia', size: 'sm',
    sub: p === 'desktop' ? 'Tendrás un acceso directo en el escritorio y la app abrirá en su propia ventana.' : 'Tendrás el ícono en tu pantalla de inicio, como cualquier app.',
    body: `<div class="stack">
      <div class="row" style="gap:14px"><img src="/assets/icon-192.png" alt="" style="width:56px;height:56px;border-radius:16px"><div><b>SanoFarmacia</b><div class="small muted">sano-farmacia.web.app</div></div></div>
      ${steps.map((s, i) => step(i + 1, s)).join('')}
      ${installed ? `<div class="small muted">${icon('info')} Si ya la instalaste en este equipo, búscala en el ${p === 'desktop' ? 'escritorio o en el menú Inicio' : 'cajón de aplicaciones'}.</div>` : ''}
      <div class="box small">${icon('check')} Es el mismo sistema que en la web: tus datos, ventas e inventario se sincronizan en todos tus equipos. Imprime recibos desde la app como en el navegador.</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Entendido</button>'
  });
}

/** Botón reutilizable. Se oculta solo cuando ya se usa la app instalada. */
export function installButton(cls = 'btn btn-secondary') {
  if (isStandalone()) return '';
  return `<button type="button" class="${cls}" data-install>${icon('install')} Instalar app</button>`;
}
export function bindInstallButtons(root = document) {
  root.querySelectorAll('[data-install]').forEach((b) => { b.onclick = installApp; });
}
