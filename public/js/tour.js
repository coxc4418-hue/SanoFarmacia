// SanoFarmacia — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a SanoFarmacia! 💊', text: 'En un minuto te mostramos cómo manejar tu farmacia aquí: venta por caja, blíster o unidad, lotes y vencimientos, recetas, pacientes con su tratamiento, pedidos por WhatsApp, compras y caja. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetirlo desde el menú › Ayuda.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Vender, pedidos, pacientes, recetas, fidelizar, inventario, compras, facturas, caja, reportes y ajustes. Los números de colores son avisos: pedidos nuevos, productos por vencer o agotarse, recompras y facturas de proveedores por pagar.' },
      { route: 'inicio', sel: ['#sb-search', '#tb-search'], title: 'Búsqueda rápida', text: 'Busca un medicamento por nombre, principio activo o código de barras; un paciente por nombre, cédula o teléfono; un pedido o una factura. En la computadora: Ctrl + K.' },
      { route: 'inicio', sel: ['[data-tour="quick"]'], title: 'Accesos rápidos', text: 'Vender, recibir mercancía, registrar una toma de tensión o glucosa y crear un paciente. Atajos: F1 vender, F2 inventario, F3 pacientes, F4 pedidos.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Tu farmacia hoy', text: 'Ventas y ganancia del día, productos bajo el mínimo, lotes por vencer, recompras pendientes y cuentas por pagar a proveedores.' },
      { route: 'inicio', sel: ['[data-tour="expiry"]'], title: 'Vencimientos primero', text: 'Los lotes que vencen pronto aparecen aquí. Al vender, el sistema descuenta siempre del lote que vence primero (FEFO), así no se te pierde mercancía.' },
      { route: 'inicio', sel: ['[data-tour="follow"]'], title: 'Recompras', text: 'Pacientes crónicos a los que se les acaba su tratamiento. Escríbeles por WhatsApp con el mensaje listo y véndeles antes de que se vayan a otra farmacia.' },
      { route: 'vender', sel: ['[data-tour="pos-search"]'], title: 'Vender', text: 'Escanea el código de barras o busca por nombre o principio activo. Eliges caja, blíster o unidad, y el sistema te muestra el lote, el vencimiento y los equivalentes más económicos.' },
      { route: 'vender', sel: ['[data-tour="pos-client"]'], title: 'Paciente, receta y convenio', text: 'Al elegir el paciente ves sus alergias (te avisa si un producto choca con ellas), sus puntos y su convenio o seguro. Los medicamentos con receta, antibióticos y controlados piden los datos del médico y quedan en el libro de recetas.' },
      { route: 'vender', sel: ['[data-tour="pos-pay"]', '#cart-fab'], title: 'Cobrar', text: 'Varias formas de pago a la vez con cálculo del vuelto, en tu moneda y en la segunda moneda si la activas. También a crédito o con la parte que cubre el seguro. Cobra rápido con F9.' },
      { route: 'pedidos', sel: ['#o-tabs', '#view'], title: 'Pedidos en línea', text: 'Tus clientes piden desde tu catálogo en línea (con delivery o para retirar). Aquí los aceptas, los preparas, avisas por WhatsApp que están listos y los cobras con un toque.' },
      { route: 'inventario', sel: ['[data-tour="inv-tabs"]', '#i-tabs'], title: 'Inventario por lotes', text: 'Existencias en cajas y unidades, bajo mínimo, vencimientos a 30, 60, 90 y 180 días, movimientos y conteo físico. Retira o devuelve un lote vencido con un toque.' },
      { route: 'inicio', title: '¡A vender! 🎉', text: 'Prueba ahora: en Vender busca “acetaminofén” y véndelo por blíster, o en Pedidos atiende el pedido nuevo de Patricia. María Elena tiene su recompra de losartán pendiente. Más recorridos en el menú › Ayuda.', final: true }
    ]
  },
  recetas: {
    name: 'Recetas y controlados', desc: 'Libro de recetas, antibióticos y psicotrópicos', icon: 'file',
    steps: [
      { route: 'recetas', sel: ['#rx-tabs'], title: 'Libro de recetas', text: 'Cada venta con receta queda registrada con el médico, su matrícula, el paciente, los productos y los lotes despachados. Los controlados van en su propio libro.' },
      { route: 'recetas', sel: ['#rx-range', '#rx-from'], title: 'Por fechas', text: 'Elige el período y revisa o busca cualquier receta despachada.' },
      { route: 'recetas', sel: ['#rx-print', '#rx-csv'], title: 'Para la inspección', text: 'Imprime el libro con el encabezado del farmacéutico regente o expórtalo a Excel (CSV) cuando te lo pidan.', final: true }
    ]
  },
  fidelidad: {
    name: 'Pacientes y fidelización', desc: 'Tratamientos, recompras, convenios y puntos', icon: 'heart',
    steps: [
      { route: 'pacientes', sel: ['[data-tour="filters"]'], title: 'Pacientes', text: 'Cada paciente guarda sus alergias, enfermedades, tratamientos continuos, mediciones (tensión, glucosa…), compras y recetas. Filtra por crónicos, recompras, convenio o saldo.' },
      { route: 'fidelizar', sel: ['#l-tabs'], title: 'A quién escribirle hoy', text: 'Recompras de tratamientos, convenios por cobrar, saldos pendientes, cumpleaños y puntos. Cada uno con su botón de WhatsApp y el mensaje listo.' },
      { route: 'fidelizar', title: 'Convenios y seguros', text: 'Descuento por convenio y parte cubierta por el seguro: lo cubierto queda por cobrar a la aseguradora y sacas su estado de cuenta impreso.' },
      { route: 'pacientes', title: 'Tarjeta digital del paciente', text: 'Cada paciente tiene su tarjeta en el teléfono: sus puntos, sus tratamientos con la fecha de su próxima compra y el botón para pedir en línea.', final: true }
    ]
  },
  compras: {
    name: 'Compras, caja y reportes', desc: 'Pedidos a proveedores, cuentas por pagar y reportes', icon: 'truck',
    steps: [
      { route: 'compras', sel: ['#p-tabs'], title: 'Compras', text: 'El sugerido te arma el pedido con lo que está bajo el mínimo. Envía la orden al proveedor por WhatsApp y al recibirla registra lote, vencimiento, costo y nuevo precio.' },
      { route: 'compras', sel: ['#p-tabs', '#view'], title: 'Cuentas por pagar', text: 'Las facturas a crédito quedan con su fecha de vencimiento; te avisa de las vencidas y registras los abonos desde la caja o aparte.' },
      { route: 'caja', sel: ['#view'], title: 'Caja', text: 'Abre la caja con el fondo inicial; cada cobro suma por forma de pago. Registra gastos e ingresos, y al cerrar compara lo contado con lo esperado.' },
      { route: 'facturas', sel: ['#view'], title: 'Facturas', text: 'Todas las ventas con su detalle de lotes, receta y convenio. Reimprime o anula con PIN: al anular, el producto vuelve a su lote.' },
      { route: 'caja', sel: ['.sb-nav [data-nav="reportes"]', '#view'], title: 'Reportes', text: 'Ventas y ganancia por día, productos más vendidos y más rentables, clasificación ABC, horas pico, valor del inventario, pérdidas por vencimiento y ventas por vendedor. Protegidos con el PIN (en la demo: 1234).', final: true }
    ]
  }
};
let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sg_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-farmacia-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar SanoFarmacia, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
