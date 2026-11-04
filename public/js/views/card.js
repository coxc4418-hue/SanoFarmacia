// SanoFarmacia — Tarjeta digital pública del paciente: /tarjeta/CODIGO (sin sesión)
import { getCard } from '../store.js';
import { esc, fmtDate, todayKey, fromKey, waLink, applyLocale, usd } from '../utils.js';
import { icon } from '../icons.js';
import { qrDataURL } from '../shared.js';

const days = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);

export async function mount(root) {
  document.title = 'Mi tarjeta · SanoFarmacia';
  const code = (/\/tarjeta\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="pcard-page"><div class="empty"><div class="spinner"></div></div></div>';
  let c = null;
  try { c = code ? await getCard(code) : null; } catch (e) { console.error(e); }
  if (!c) {
    root.innerHTML = `<div class="pcard-page"><div class="mcard mcard-err"><img src="/assets/logo.svg" alt="" width="64"><h1>Tarjeta no encontrada</h1><p>El código <b>${esc(code || '—')}</b> no existe o fue renovado. Pide tu tarjeta actualizada en tu farmacia.</p><a class="btn btn-primary" href="/">Ir a SanoFarmacia</a></div></div>`;
    return;
  }
  try { applyLocale(c.country || 'VE'); } catch (_) {}
  const qr = await qrDataURL(location.origin + '/tarjeta/' + code, 6);
  const t = todayKey();
  const tr = (c.treatments || []).map((x) => ({ ...x, d: x.nextAt ? days(t, x.nextAt) : null })).sort((a, b) => (a.d ?? 999) - (b.d ?? 999));
  const shop = c.shopSlug ? `/pedido/${encodeURIComponent(c.shopSlug)}` : '';
  const wa = c.shopPhone ? waLink(c.shopPhone, `Hola, soy ${c.name} (${c.number}). Quiero apartar mis medicinas${tr[0] ? `: ${tr.slice(0, 3).map((x) => x.name).join(', ')}` : ''}.`) : '';
  const pts = c.points;

  root.innerHTML = `<div class="pcard-page">
    <div class="mcard">
      <div class="mcard-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(c.shop || 'Mi farmacia')}</b><small>Tarjeta de paciente</small></div>${c.active ? (c.agreement ? `<span class="mcard-badge tone-violet">${icon('handshake')} ${esc(c.agreement)}</span>` : '') : '<span class="mcard-badge tone-neutral">Inactiva</span>'}</div>
      <div class="mcard-name">${esc(c.name)}</div>
      <div class="mcard-num">${esc(c.number)} · ${esc(code)}</div>
      ${pts != null ? `<div class="mcard-points"><div><small>Tus puntos</small><b>${pts}</b></div>${c.pointValue ? `<div><small>Equivalen a</small><b>${usd(pts * c.pointValue)}</b></div>` : ''}<span>${icon('star')}</span></div>` : ''}
      ${tr.length ? `<div class="mcard-meds"><b>${icon('pill')} Tus tratamientos</b>${tr.map((x) => `<div class="mcard-med ${x.d != null && x.d <= 3 ? 'due' : ''}"><div class="grow"><b>${esc(x.name)}</b><small>${x.lastAt ? `Última compra ${fmtDate(x.lastAt)}` : ''}</small></div><span>${x.d == null ? '' : x.d < 0 ? `Se te acabó hace ${-x.d} d` : x.d === 0 ? 'Se te acaba hoy' : `Te alcanza ${x.d} d`}</span></div>`).join('')}
        <p>Te avisamos por WhatsApp antes de que se te acabe.</p></div>` : ''}
      <div class="mcard-stats"><div><b>${c.visits || 0}</b><small>compras</small></div><div><b>${c.lastVisitAt ? fmtDate(c.lastVisitAt.slice(0, 10)) : '—'}</b><small>última compra</small></div></div>
      <div class="mcard-qr"><img src="${qr}" alt="QR de la tarjeta"></div>
      <p class="mcard-hint">Muestra este código al pagar para sumar tus puntos.</p>
      <div class="mcard-foot">${shop ? `<a class="btn btn-primary btn-sm" href="${shop}">${icon('bag')} Pedir en línea</a>` : ''}${wa ? `<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Apartar mis medicinas</a>` : ''}${c.instagram ? `<a class="btn btn-secondary btn-sm" href="https://instagram.com/${esc(c.instagram.replace('@', ''))}" target="_blank" rel="noopener">${esc(c.instagram)}</a>` : ''}${c.shopAddress ? `<small>${icon('pin')} ${esc(c.shopAddress)}</small>` : ''}</div>
    </div>
    <p class="pcard-by">Hecho con <b>SanoFarmacia</b> · Agrega esta página a tu pantalla de inicio para tenerla siempre a mano.</p>
  </div>`;
}
