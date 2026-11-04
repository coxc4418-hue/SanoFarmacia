// SanoFarmacia — Pedidos en línea: lo que tus pacientes piden desde el catálogo público
import { store, ORDER_STATUS, orderBadge } from '../store.js';
import { setOrderStatus, deleteOrder, shopUrl, publishShop } from '../ops.js';
import { esc, usd, bs, toast, emptyState, fmtAgo, fmtDateTime, confirmDialog, promptDialog } from '../utils.js';
import { icon } from '../icons.js';
import { waClient, qrDataURL } from '../shared.js';
import { stockText, upb, rxBadge } from '../pharma.js';
import { openClient } from '../client.js';

const TABS = [['abiertos', 'Por atender'], ['nueva', 'Nuevos'], ['preparando', 'Preparando'], ['lista', 'Listos'], ['cerrados', 'Entregados / cancelados']];

export function mount(el, { navigate, params = {} }) {
  let tab = params.tab || 'abiertos';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Pedidos en línea</h1><p class="view-sub">Tus pacientes buscan, ven el precio y te piden desde su teléfono. Tú lo preparas y lo cobras aquí.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="o-share">${icon('qr')} Mi catálogo</button><button class="btn btn-whatsapp" id="o-wa">${icon('whatsapp')} Compartir enlace</button></div></div>
    <div id="o-off"></div>
    <div class="tabs" id="o-tabs"></div>
    <div id="o-list" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  const S = () => store.settings.shop || {};
  const url = () => (S().slug ? shopUrl(S().slug) : '');

  $('#o-share').onclick = async () => {
    if (!url()) { toast('El enlace se está creando, intenta en unos segundos.', 'info'); return; }
    await publishShop({ force: true }).catch(() => {});
    const qr = await qrDataURL(url(), 6);
    const { openModal } = await import('../utils.js');
    const m = openModal({
      title: 'Tu catálogo en línea', sub: 'Imprímelo en el mostrador o compártelo por WhatsApp e Instagram', size: 'sm',
      body: `<div class="center stack" style="align-items:center"><img src="${qr}" class="qr-img lg" alt="QR"><a class="mono small" href="${url()}" target="_blank" rel="noopener">${esc(url())}</a><div class="small muted">Muestra tus productos con precio${S().showStock !== false ? ' y disponibilidad' : ''}. Los controlados ${S().hideControlled !== false ? 'no se muestran' : 'se muestran pero requieren receta'}.</div></div>`,
      footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><a class="btn btn-primary" href="${url()}" target="_blank" rel="noopener">${icon('external')} Abrir</a>`
    });
    m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url()); toast('Enlace copiado'); } catch (_) { toast(url(), 'info', 6000); } };
  };
  $('#o-wa').onclick = () => { if (!url()) return; const t = `🛒 Haz tu pedido en *${store.businessName}*: busca tus medicinas, ve el precio y te lo tenemos listo${S().delivery !== false ? ' o te lo llevamos' : ''}.\n\n👉 ${url()}`; window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener'); };

  function filtered() {
    const all = store.orders;
    if (tab === 'abiertos') return store.pendingOrders;
    if (tab === 'cerrados') return all.filter((o) => ['entregada', 'cancelada'].includes(o.status)).slice(0, 60);
    return all.filter((o) => (o.status || 'nueva') === tab);
  }

  function itemRow(i) {
    const p = store.product(i.id);
    const st = p ? Number(p.stock) || 0 : 0;
    const need = (Number(i.q) || 1) * (p ? upb(p) : 1);
    const ok = p && (p.trackStock === false || st >= need);
    return `<div class="oline"><span class="oline-q">${i.q}×</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(i.n || p?.name || 'Producto')}</b> ${p ? rxBadge(p, true) : ''}<div class="t-sub">${p ? (ok ? `<span class="text-success">${icon('check')} hay ${stockText(p)}</span>` : `<span class="text-danger">${icon('alert')} ${st > 0 ? `solo ${stockText(p)}` : 'agotado'}</span>`) : '<span class="text-danger">ya no está en el inventario</span>'}</div></div><b class="num">${usd((Number(i.p) || 0) * (Number(i.q) || 1))}</b></div>`;
  }

  function card(o) {
    const st = o.status || 'nueva';
    const cl = (o.clientId && store.client(o.clientId)) || store.findByPhone(o.phone);
    const missing = (o.items || []).some((i) => { const p = store.product(i.id); return !p || (p.trackStock !== false && (Number(p.stock) || 0) < (Number(i.q) || 1) * upb(p)); });
    const hasRx = (o.items || []).some((i) => i.rx);
    return `<div class="card order-card st-${st}">
      <div class="between" style="align-items:flex-start;gap:10px">
        <div style="min-width:0"><div class="row row-wrap" style="gap:6px"><b style="font-size:16px">${esc(o.name)}</b>${orderBadge(st)}${o.mode === 'delivery' ? `<span class="badge badge-violet">${icon('truck')} Delivery</span>` : `<span class="badge badge-neutral">${icon('bag')} Retira</span>`}${hasRx ? `<span class="badge badge-info">${icon('file')} con receta</span>` : ''}</div>
          <div class="t-sub">${esc(o.number || '')} · ${fmtAgo(o.createdAt)} · ${esc(o.phone || '')}${cl ? ` · <button class="linkish" data-cl="${cl.id}">ver paciente</button>` : ''}</div>
          ${o.mode === 'delivery' && o.address ? `<div class="small mt-xs">${icon('pin')} ${esc(o.address)}</div>` : ''}
          ${o.note ? `<div class="small mt-xs muted">“${esc(o.note)}”</div>` : ''}</div>
        <div class="r"><b style="font-size:18px">${usd(o.total || 0)}</b>${bs(o.total || 0) ? `<div class="t-sub">${bs(o.total)}</div>` : ''}${o.payMethod ? `<div class="t-sub">paga con ${esc(o.payMethod)}</div>` : ''}</div>
      </div>
      <div class="olines mt">${(o.items || []).map(itemRow).join('')}</div>
      ${missing && !['entregada', 'cancelada'].includes(st) ? `<div class="small text-danger mt-xs">${icon('alert')} Falta inventario: avísale y ofrécele un equivalente.</div>` : ''}
      <div class="row row-wrap mt" style="gap:6px">
        ${st === 'nueva' ? `<button class="btn btn-primary btn-sm" data-a="preparando" data-id="${o.id}">${icon('check')} Aceptar y preparar</button>` : ''}
        ${st === 'preparando' ? `<button class="btn btn-primary btn-sm" data-a="lista" data-id="${o.id}">${icon('bag')} Está listo</button>` : ''}
        ${['nueva', 'preparando', 'lista'].includes(st) ? `<button class="btn btn-success btn-sm" data-a="cobrar" data-id="${o.id}">${icon('cart')} Cobrar y entregar</button>` : ''}
        ${o.phone ? `<button class="btn btn-whatsapp btn-sm" data-a="wa" data-id="${o.id}">${icon('whatsapp')} WhatsApp</button>` : ''}
        ${['nueva', 'preparando', 'lista'].includes(st) ? `<button class="btn btn-ghost btn-sm text-danger" data-a="cancelar" data-id="${o.id}">${icon('x')} Cancelar</button>` : ''}
        ${['entregada', 'cancelada'].includes(st) ? `${o.saleNumber ? `<span class="small muted">Venta ${esc(o.saleNumber)}</span>` : ''}<button class="btn btn-ghost btn-sm" data-a="borrar" data-id="${o.id}">${icon('trash')} Borrar</button>` : ''}
      </div>
    </div>`;
  }

  function render() {
    $('#o-off').innerHTML = S().enabled === false ? `<div class="banner offline-banner"><span>${icon('alert')} El catálogo en línea está apagado. Actívalo en Configuración → Pedidos en línea.</span><button class="btn btn-sm btn-primary" id="o-cfg">Configurar</button></div>` : '';
    $('#o-cfg')?.addEventListener('click', () => navigate('ajustes', { tab: 'pedidos' }));
    const count = (k) => k === 'abiertos' ? store.pendingOrders.length : k === 'cerrados' ? 0 : store.orders.filter((o) => (o.status || 'nueva') === k).length;
    $('#o-tabs').innerHTML = TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${l}${count(k) ? ` <span class="tab-n">${count(k)}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); });
    const list = filtered();
    $('#o-list').innerHTML = list.length ? `<div class="order-grid">${list.map(card).join('')}</div>`
      : emptyState('bag', tab === 'cerrados' ? 'Sin pedidos cerrados' : 'Sin pedidos por atender', 'Comparte tu catálogo por WhatsApp, Instagram o con el QR del mostrador. Los pedidos llegan aquí al instante.');
    el.querySelectorAll('[data-cl]').forEach((b) => b.onclick = () => openClient(b.dataset.cl));
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => act(b.dataset.a, store.orders.find((o) => o.id === b.dataset.id)));
  }

  async function act(a, o) {
    if (!o) return;
    try {
      if (a === 'preparando') { await setOrderStatus(o, 'preparando'); toast('Pedido aceptado'); if (o.phone) waClient('pedido_recibido', { order: o }); }
      if (a === 'lista') { await setOrderStatus(o, 'lista'); toast('Pedido listo'); if (o.phone) waClient('pedido_listo', { order: o }); }
      if (a === 'cobrar') navigate('vender', { orderId: o.id });
      if (a === 'wa') waMenu(o);
      if (a === 'cancelar') {
        const why = await promptDialog({ title: 'Cancelar pedido', label: 'Motivo (opcional, se lo puedes enviar)', value: '', confirmText: 'Cancelar pedido' });
        if (why == null) return;
        await setOrderStatus(o, 'cancelada', { cancelReason: why });
        toast('Pedido cancelado', 'warning');
      }
      if (a === 'borrar') { if (await confirmDialog({ title: 'Borrar pedido', message: 'Se elimina de la lista. La venta (si la hubo) se conserva.', confirmText: 'Borrar', danger: true })) await deleteOrder(o); }
    } catch (e) { toast(e.message, 'danger'); }
  }

  async function waMenu(o) {
    const { openModal } = await import('../utils.js');
    const m = openModal({
      title: 'WhatsApp', sub: esc(o.name), size: 'sm',
      body: `<div class="list">
        <button class="list-item" data-k="pedido_recibido">${icon('check')}<div class="grow"><b>Recibimos tu pedido</b></div></button>
        <button class="list-item" data-k="pedido_listo">${icon('bag')}<div class="grow"><b>Tu pedido está listo</b></div></button>
        <button class="list-item" data-k="pedido_faltante">${icon('alert')}<div class="grow"><b>Falta un producto</b><div class="t-sub">Ofrece un equivalente</div></div></button>
      </div>`,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
    m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = async () => {
      m.close();
      let extra = '';
      if (b.dataset.k === 'pedido_faltante') { extra = await promptDialog({ title: 'Mensaje', label: 'Qué falta y qué le ofreces', value: 'no tenemos disponible uno de los productos, pero tenemos un equivalente con el mismo principio activo. ¿Te lo preparamos?' }); if (extra == null) return; }
      waClient(b.dataset.k, { order: o, extra });
    });
  }

  render();
  const off = store.on('*', (evt) => { if (['orders', 'products', 'settings', 'clients'].includes(evt)) render(); });
  return () => off();
}
