// SanoFarmacia — Componentes compartidos: país y moneda, QR, WhatsApp al cliente e impresión
import { store } from './store.js';
import { openModal, toast, num, esc, fmtDateTime, fmtDate, setBusy, usd, bs, fx, methodLabel, qtyFmt, printHTML, todayKey, waLink, COUNTRIES, loc, flagImg, fmtTime, fromKey, dayKey, addDays } from './utils.js';
import { PACKS, RX } from './pharma.js';
import { icon } from './icons.js';

export const APP_NAME = 'SanoFarmacia';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa SanoFarmacia para mi farmacia. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// PAÍS DE TRABAJO (se elige una sola vez, al entrar por primera vez)
// ======================================================================
export function openCountryPicker({ force = false } = {}) {
  return new Promise((resolve) => {
    let picked = store.settings.country || '';
    let cur = store.settings.currency || '';
    const list = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    const m = openModal({
      title: force ? '¿En qué país está tu farmacia?' : 'País y moneda', size: 'md', dismissible: !force,
      sub: 'Según el país, SanoFarmacia trabaja con su moneda, sus formas de pago y el código telefónico para WhatsApp.',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Buscar país…" autocomplete="off"></label><div class="country-grid" data-l></div><div data-cur></div><div class="error-msg" data-err></div></div>`,
      footer: `${force ? '' : '<button class="btn btn-secondary" data-close>Cancelar</button>'}<button class="btn btn-primary btn-lg" data-ok disabled>Continuar</button>`,
      onClose: () => resolve(picked && store.settings.country === picked ? picked : null)
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (qv = '') => {
      const t = qv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      m.el.querySelector('[data-l]').innerHTML = list.filter(([, c]) => !t || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).map(([k, c]) =>
        `<button type="button" class="country ${picked === k ? 'on' : ''}" data-c="${k}"><span class="flag">${flagImg(k, 24)}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.curName)} · ${esc(c.sym)}</small></span></button>`).join('');
      m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { picked = b.dataset.c; cur = COUNTRIES[picked].cur; draw(m.el.querySelector('[data-q]').value); });
      const c = COUNTRIES[picked];
      m.el.querySelector('[data-cur]').innerHTML = c ? `<div class="card stack" style="padding:12px 14px"><div class="row" style="gap:10px"><span class="flag">${flagImg(picked, 30)}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">Formas de pago: Efectivo, tarjetas, transferencia${(c.extra || []).length ? ' y otras locales' : ''} · WhatsApp +${esc(c.dial)}</div></div></div>
        ${c.alt ? `<div class="field"><label>Moneda con la que cobras</label><div class="seg seg-block">${[[c.cur, c.curName + ' (' + c.sym + ')'], [c.alt.cur, c.alt.curName + ' (' + c.alt.sym + ')']].map(([k, l]) => `<button type="button" data-mc="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>` : `<div class="small">Moneda: <b>${esc(c.curName)} (${esc(c.sym)})</b></div>`}
        ${store.settings.country && store.settings.country !== picked ? `<div class="vital-alert warning">Los montos ya registrados no se convierten: revisa los precios de los productos después de cambiar de país.</div>` : ''}</div>` : '';
      m.el.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { cur = b.dataset.mc; draw(m.el.querySelector('[data-q]').value); });
      m.el.querySelector('[data-ok]').disabled = !picked;
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      if (!picked) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { await store.setCountry(picked, cur); toast(`Listo: trabajarás en ${loc().curName} (${loc().sym})`); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    draw();
  });
}

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
export async function qrDataURL(text, cell = 4) {
  try {
    const q = await loadQR();
    const qr = q(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL PACIENTE
// ======================================================================
const BASE = 'https://sano-farmacia.web.app';
export const CARD_URL = (c) => (c?.cardCode ? `${BASE}/tarjeta/${c.cardCode}` : '');
export const SHOP_URL = () => (store.settings.shop?.enabled !== false && store.settings.shop?.slug ? `${BASE}/pedido/${store.settings.shop.slug}` : '');
const dmy = (k) => (k ? fromKey(k).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
export function clientMessage(kind, { client = {}, extra = '', treatment = null, order = null, sale = null } = {}) {
  const name = String(client.name || order?.name || '').split(' ')[0];
  const biz = store.businessName;
  const addr = store.settings.address ? `\n📍 ${store.settings.address}` : '';
  const card = CARD_URL(client);
  const shop = SHOP_URL();
  const h = `Hola ${name} 👋, te escribimos de *${biz}* 💚.`;
  const L = store.loyalty;
  const pts = Math.floor(Number(client.points) || 0);
  const T = {
    recompra: () => `${h}\n\n💊 Según tu tratamiento, tu *${treatment?.name || 'medicina'}* ${treatment?.nextAt && treatment.nextAt < todayKey() ? 'ya se te debe haber terminado' : `se te termina ${treatment?.nextAt === todayKey() ? '*hoy*' : `el *${dmy(treatment?.nextAt)}*`}`}.\n\n¿Te la apartamos? Responde *SÍ* y te la tenemos lista${store.settings.shop?.delivery !== false ? ' o te la llevamos' : ''}.${shop ? `\n🛒 También puedes pedirla aquí: ${shop}` : ''}`,
    gracias: () => `¡Gracias por tu compra, ${name}! 💚${sale ? `\n\n🧾 Recibo *${sale.number}* · ${usd(sale.total)}` : ''}${L?.enabled ? `\n⭐ Tienes *${pts}* puntos${L.pointValue ? ` (equivalen a ${usd(pts * L.pointValue)} de descuento)` : ''}.` : ''}${card ? `\n\n📲 Tu tarjeta: ${card}` : ''}\n\nCualquier duda sobre cómo tomar tus medicamentos, escríbenos.`,
    pedido_recibido: () => `${h}\n\n✅ Recibimos tu pedido${order?.number ? ` *${order.number}*` : ''} y ya lo estamos preparando.${order?.total ? `\nTotal aproximado: *${usd(order.total)}*${fx() ? ` (${bs(order.total)})` : ''}` : ''}\n\nTe avisamos apenas esté listo.`,
    pedido_listo: () => `${h}\n\n🛍️ ¡Tu pedido${order?.number ? ` *${order.number}*` : ''} está listo! ${order?.mode === 'delivery' ? 'Ya sale para tu dirección 🛵.' : `Puedes pasar a retirarlo.${addr}`}${order?.items?.some((i) => i.rx) ? '\n\n📄 Recuerda traer la *receta médica* de los productos que la requieren.' : ''}`,
    pedido_faltante: () => `${h}\n\nSobre tu pedido${order?.number ? ` *${order.number}*` : ''}: ${extra || 'uno de los productos no está disponible. ¿Te ofrecemos un equivalente?'}`,
    medicion: () => `${h}\n\n🩺 Tu control de hoy: ${extra}.\n\nRecuerda que este resultado es orientativo; compártelo con tu médico.`,
    cumple: () => `🎉 ¡Feliz cumpleaños, ${name}! 🎂\n\nTodo el equipo de *${biz}* te desea un día lleno de salud.${extra ? `\n\n🎁 ${extra}` : store.settings.birthdayOffer ? `\n\n🎁 ${store.settings.birthdayOffer}` : ''}`,
    deuda: () => `${h}\n\nTe recordamos que tienes un saldo pendiente de *${usd(client.balance || extra)}*. Puedes cancelarlo en tu próxima visita o por transferencia. ¡Gracias!`,
    puntos: () => `${h}\n\n⭐ Tienes *${pts}* puntos acumulados${L?.pointValue ? `: equivalen a *${usd(pts * L.pointValue)}* de descuento en tu próxima compra` : ''}.${card ? `\n📲 ${card}` : ''}`,
    tarjeta: () => `${h}\n\n📲 Esta es tu tarjeta de paciente: ${card}\n\nAhí ves tus puntos y cuándo te toca comprar tus medicinas de tratamiento.${shop ? `\n🛒 Haz tus pedidos aquí: ${shop}` : ''}`,
    catalogo: () => `${h}\n\n🛒 Ahora puedes hacer tu pedido en línea: busca tus medicinas, ve el precio y la disponibilidad y te lo tenemos listo${store.settings.shop?.delivery !== false ? ' o te lo llevamos' : ''}.\n\n👉 ${shop}`,
    libre: () => `${h}\n\n${extra || ''}`
  };
  return (T[kind] || T.libre)();
}
export function waClient(kind, ctx = {}) {
  const phone = ctx.client?.phone || ctx.order?.phone || '';
  const text = clientMessage(kind, ctx);
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN: recibos y documentos
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
function ticketCSS(fmt) {
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  return `@page { margin: ${fmt === 'carta' ? '12mm' : '2mm'}; }
    body { font-family: ${fmt === 'carta' ? 'Arial, Helvetica, sans-serif' : "'Courier New', monospace"}; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; white-space: nowrap; padding-left: 6px; }
    .big { font-size: 1.25em; font-weight: bold; } .sm { font-size: .85em; }`;
}
function headerHTML() {
  const s = store.settings;
  return `<div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">${esc(loc().tax)}: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}
    ${s.pharmacist ? `<div class="c sm">Farmacéutico: ${esc(s.pharmacist)}${s.pharmacistLicense ? ' · ' + esc(s.pharmacistLicense) : ''}</div>` : ''}`;
}
const packTxt = (it) => (it.pack === 'blister' ? ' (blíster)' : it.pack === 'unidad' ? ' (unidad)' : '');

/** Recibo de venta (ticket o carta) */
export function receiptHTML(sale) {
  const s = store.settings;
  const ivaPct = Number(s.iva) || 0;
  const iva = ivaPct > 0 ? (sale.total - sale.total / (1 + ivaPct / 100)) : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td colspan="2">${esc(methodLabel(p.method))}</td><td class="r">${usd(p.amount)}</td></tr>`).join('');
  const c = sale.memberId ? store.client(sale.memberId) : null;
  const L = store.loyalty;
  const rate = Number(sale.fxRate) || 0; const F = fx();
  const eq = (v) => (rate > 0 && F ? `${F.sym} ${num(v * rate, 2)}` : '');
  return `<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(sale.number)}</title><style>${ticketCSS(s.receiptFormat)}</style></head><body>
    ${headerHTML()}
    <div class="hr"></div>
    <div class="c big">${esc(s.docTitle || 'RECIBO')}</div>
    <div class="c b">N° ${esc(sale.number)}</div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Cliente: ${esc(sale.memberName || 'Cliente de mostrador')}${sale.memberIdDoc ? ` · ${esc(loc().id)} ${esc(sale.memberIdDoc)}` : ''}</div>
    ${sale.sellerName ? `<div>Atendido por: ${esc(sale.sellerName)}</div>` : ''}
    ${sale.status === 'voided' ? '<div class="c b">*** DOCUMENTO ANULADO ***</div>' : ''}
    <div class="hr"></div>
    <table>${(sale.items || []).map((it) => `<tr><td colspan="2" style="padding-top:3px">${qtyFmt(it.qty)} x ${esc(it.name)}${packTxt(it)}${it.rx && it.rx !== 'libre' ? ' [Rx]' : ''}${it.lots ? `<div class="sm">Lote: ${esc(it.lots)}</div>` : ''}</td><td class="r">${usd(it.total ?? it.price * it.qty)}</td></tr>`).join('')}</table>
    <div class="hr"></div>
    <table>
      <tr><td colspan="2">Subtotal</td><td class="r">${usd(sale.subtotal)}</td></tr>
      ${sale.agreementDiscount > 0 ? `<tr><td colspan="2">Desc. convenio ${esc(sale.agreementName || '')}</td><td class="r">-${usd(sale.agreementDiscount)}</td></tr>` : ''}
      ${sale.pointsDiscount > 0 ? `<tr><td colspan="2">Canje de ${sale.pointsUsed} puntos</td><td class="r">-${usd(sale.pointsDiscount)}</td></tr>` : ''}
      ${sale.manualDiscount > 0 ? `<tr><td colspan="2">Descuento</td><td class="r">-${usd(sale.manualDiscount)}</td></tr>` : ''}
      <tr class="big"><td colspan="2">TOTAL</td><td class="r">${usd(sale.total)}</td></tr>
      ${eq(sale.total) ? `<tr><td colspan="2">Equivalente</td><td class="r">${eq(sale.total)}</td></tr><tr><td colspan="3" class="sm">Tasa: 1 ${esc(loc().sym)} = ${num(rate, 2)} ${esc(F.sym)}</td></tr>` : ''}
      ${iva > 0.009 ? `<tr><td colspan="2">Impuesto ${num(ivaPct, 0)}% incluido</td><td class="r">${usd(iva)}</td></tr>` : ''}
      ${sale.agreementDue > 0 ? `<tr><td colspan="2">Cubre ${esc(sale.agreementName || 'convenio')}</td><td class="r">${usd(sale.agreementDue)}</td></tr><tr class="b"><td colspan="2">Paga el paciente</td><td class="r">${usd(sale.total - sale.agreementDue)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${usd(sale.changeUSD)}</div>` : ''}
    ${sale.credit > 0.009 ? `<div class="b">Queda pendiente: ${usd(sale.credit)}</div>` : ''}
    ${c && L?.enabled && sale.kind === 'venta' ? `<div class="hr"></div><div class="c">Puntos ganados: ${sale.pointsEarned || 0} · Saldo: ${Math.floor(c.points || 0)} pts</div>` : ''}
    ${sale.rxId ? `<div class="hr"></div><div class="sm">Dispensado con receta médica (registrado en el libro de recetas).</div>` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por su compra!')}</div>
    <div class="c sm" style="margin-top:4px">SanoFarmacia</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

/** Documento imprimible genérico (reportes, cierres, libros, órdenes de compra) */
export function printDoc(title, inner, { accent = '#047857', landscape = false } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; ${landscape ? 'size: landscape;' : ''} }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: ${accent}; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; } .c { text-align: center; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
    .sign { margin-top: 50px; display: flex; gap: 40px; } .sign div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}${store.settings.rif ? ` · ${esc(loc().tax)} ${esc(store.settings.rif)}` : ''}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">SanoFarmacia — Gestión profesional para farmacias</p>
  </body></html>`);
}

export function notifyLowStock(list) {
  if (!list?.length) return;
  const names = list.slice(0, 3).map((i) => i.name).join(', ');
  toast(`Por agotarse: ${names}${list.length > 3 ? ` y ${list.length - 3} más` : ''}`, 'warning', 6000);
}

export { usd, bs, fmtTime, PACKS, RX };
