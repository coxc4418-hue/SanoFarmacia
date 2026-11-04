// SanoFarmacia — Catálogo público para pedir en línea: /pedido/SLUG (sin sesión)
import { getShop } from '../store.js';
import { db, collection, addDoc } from '../firebase.js';
import { esc, num, normalize, debounce, waLink, applyLocale, toast, openModal } from '../utils.js';
import { icon } from '../icons.js';

const RXL = { receta: 'Requiere receta', antibiotico: 'Antibiótico: requiere receta', controlado: 'Controlado: requiere receta' };
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = (n = 5) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => CODE[x % CODE.length]).join('');

export async function mount(root) {
  const slug = (/\/pedido\/([a-z0-9-]+)/i.exec(location.pathname)?.[1] || '').toLowerCase();
  root.innerHTML = '<div class="shop-page"><div class="empty"><div class="spinner"></div></div></div>';
  let S = null;
  try { S = slug ? await getShop(slug) : null; } catch (e) { console.error(e); }
  if (!S || S.enabled === false) {
    root.innerHTML = `<div class="pcard-page"><div class="mcard mcard-err"><img src="/assets/logo.svg" alt="" width="64"><h1>Catálogo no disponible</h1><p>Este enlace de pedidos no existe o la farmacia lo desactivó por ahora. Escríbele directamente por WhatsApp.</p><a class="btn btn-primary" href="/">Ir a SanoFarmacia</a></div></div>`;
    return;
  }
  try { applyLocale(S.country || 'VE'); } catch (_) {}
  document.title = `${S.shop} · Pedidos en línea`;
  const money = (v) => `${S.sym} ${num(v, S.dec ?? 2)}`;
  const fxm = (v) => (S.fx ? `${S.fx.sym} ${num(v * S.fx.rate, 2)}` : '');
  const KEY = 'sf_cart_' + slug;
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { cart = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) {} };
  const items = S.items || [];
  const byId = new Map(items.map((i) => [i.id, i]));
  Object.keys(cart).forEach((k) => { if (!byId.has(k)) delete cart[k]; });
  const cats = [...new Set(items.map((i) => i.c).filter(Boolean))].sort();
  let q = ''; let cat = '';

  root.innerHTML = `<div class="shop-page">
    <header class="shop-head">
      <div class="shop-brand"><img src="/assets/logo.svg" alt=""><div class="grow" style="min-width:0"><b class="ellipsis">${esc(S.shop)}</b><small>${S.address ? `${icon('pin')} ${esc(S.address)}` : 'Pedidos en línea'}</small></div>${S.phone ? `<a class="btn btn-whatsapp btn-icon btn-sm" href="${waLink(S.phone, `Hola, tengo una consulta sobre un pedido.`)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}</div>
      <div class="shop-hero"><h1>Pide tus medicinas sin hacer cola</h1><p>Busca, agrega al carrito y te lo tenemos listo${S.delivery ? ' o te lo llevamos' : ''}. Pagas al retirar o al recibir.${S.schedule ? `<br><small>${icon('clock')} ${esc(S.schedule)}</small>` : ''}</p></div>
      <label class="search search-big">${icon('search')}<input id="s-q" placeholder="Busca por nombre o principio activo (ej. ibuprofeno)…" autocomplete="off"></label>
      <div class="chips" id="s-cats"></div>
    </header>
    ${S.note ? `<div class="shop-note">${icon('info')} ${esc(S.note)}</div>` : ''}
    <main class="shop-grid" id="s-grid"></main>
    <button class="shop-cartbar" id="s-bar" hidden><span><b id="s-n">0</b> producto(s)</span><b id="s-t"></b><span>Ver pedido ${icon('arrowRight')}</span></button>
    <p class="pcard-by">Precios referenciales sujetos a disponibilidad · Hecho con <b>SanoFarmacia</b></p>
  </div>`;
  const $ = (s) => root.querySelector(s);

  function drawCats() {
    $('#s-cats').innerHTML = [['', 'Todo'], ...cats.map((c) => [c, c])].map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-c="${esc(k)}">${esc(l)}</button>`).join('');
    root.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cat = b.dataset.c; drawCats(); drawGrid(); });
  }
  function drawGrid() {
    const t = normalize(q);
    const list = items.filter((i) => (!cat || i.c === cat) && (!t || normalize(`${i.n} ${i.a} ${i.s} ${i.f}`).includes(t))).slice(0, 200);
    $('#s-grid').innerHTML = list.length ? list.map((i) => {
      const n = cart[i.id] || 0;
      return `<div class="shop-item ${i.ok ? '' : 'is-out'}">
        <div class="shop-ic">${icon('pill')}</div>
        <div class="grow" style="min-width:0"><b class="shop-name">${esc(i.n)}</b><div class="t-sub">${esc([i.a && i.a !== i.n ? i.a : '', i.s, i.f, i.u > 1 ? `caja x${i.u}` : ''].filter(Boolean).join(' · '))}</div>
          <div class="row row-wrap" style="gap:4px;margin-top:4px">${i.rx ? `<span class="badge badge-info">${icon('file')} ${RXL[i.rx] || 'Requiere receta'}</span>` : ''}${S.showStock ? (i.ok === 1 ? '<span class="badge badge-success">Disponible</span>' : i.ok === 2 ? '<span class="badge badge-warning">Pocas unidades</span>' : '<span class="badge badge-danger">Agotado</span>') : ''}</div></div>
        <div class="shop-buy"><b>${money(i.p)}</b>${S.fx ? `<small>${fxm(i.p)}</small>` : ''}
          ${!i.ok && S.showStock ? '' : n ? `<div class="stepper"><button data-dec="${i.id}" aria-label="Menos">${icon('minus')}</button><span>${n}</span><button data-inc="${i.id}" aria-label="Más">${icon('plus')}</button></div>` : `<button class="btn btn-primary btn-sm" data-inc="${i.id}">${icon('plus')} Agregar</button>`}</div>
      </div>`;
    }).join('') : `<div class="empty">${icon('search')}<b>No encontramos ese producto</b><span>Prueba con el principio activo o escríbenos por WhatsApp: te conseguimos un equivalente.</span></div>`;
    root.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { const id = b.dataset.inc; if ((cart[id] || 0) >= 20) return; cart[id] = (cart[id] || 0) + 1; save(); drawGrid(); bar(); });
    root.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const id = b.dataset.dec; cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; save(); drawGrid(); bar(); });
  }
  const lines = () => Object.entries(cart).map(([id, n]) => ({ i: byId.get(id), n })).filter((x) => x.i);
  const subtotal = () => lines().reduce((a, x) => a + x.i.p * x.n, 0);
  function bar() {
    const L = lines();
    $('#s-bar').hidden = !L.length;
    $('#s-n').textContent = L.reduce((a, x) => a + x.n, 0);
    $('#s-t').textContent = money(subtotal());
  }

  function checkout() {
    const L = lines(); if (!L.length) return;
    const hasRx = L.some((x) => x.i.rx);
    const mm = openModal({ title: 'Tu pedido', sub: esc(S.shop), size: 'md', body: `<form class="stack" id="o-f">
        <div class="summary-box">${L.map((x) => `<div class="summary-row"><span>${x.n} × ${esc(x.i.n)}${x.i.rx ? ' <span class="badge badge-info">Rx</span>' : ''}</span><b>${money(x.i.p * x.n)}</b></div>`).join('')}<div class="summary-row total"><span>Total aproximado</span><span id="o-tot">${money(subtotal())}</span></div></div>
        ${hasRx ? `<div class="banner info-banner">${icon('file')} Algunos productos requieren receta médica: llévala al retirar o muéstrasela al repartidor.</div>` : ''}
        <div class="form-grid">
          <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" autocomplete="name" required minlength="2" maxlength="60"></div>
          <div class="field full"><label>Teléfono / WhatsApp *</label><input class="input" name="phone" inputmode="tel" autocomplete="tel" required placeholder="${esc(S.dial ? '+' + S.dial + ' ' : '')}…"></div>
        </div>
        <div class="chips">${['retiro', ...(S.delivery ? ['delivery'] : [])].map((k, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-mode="${k}">${k === 'retiro' ? `${icon('bag')} Retiro en la farmacia` : `${icon('truck')} Delivery${S.deliveryFee ? ` (+${money(S.deliveryFee)})` : ''}`}</button>`).join('')}</div>
        <div class="field" id="o-addr" hidden><label>Dirección de entrega *</label><input class="input" name="address" maxlength="200" placeholder="Calle, casa / edificio, punto de referencia"></div>
        <div class="field"><label>¿Cómo vas a pagar?</label><select class="select" name="pay"><option>Efectivo</option><option>Pago móvil / transferencia</option><option>Tarjeta (punto de venta)</option><option>Otro</option></select></div>
        <div class="field"><label>Nota para la farmacia</label><input class="input" name="note" maxlength="300" placeholder="Ej.: si no hay, me sirve el genérico"></div>
        <div class="error-msg" id="o-err"></div>
      </form>`, footer: `<button class="btn btn-secondary" data-close>Seguir comprando</button><button class="btn btn-primary" id="o-send">${icon('check')} Enviar pedido</button>` });
    const ov = mm.el;
    const close = () => mm.close();
    let mode = 'retiro';
    const F = ov.querySelector('#o-f').elements;
    ov.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
      mode = b.dataset.mode; ov.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      ov.querySelector('#o-addr').hidden = mode !== 'delivery';
      ov.querySelector('#o-tot').textContent = money(subtotal() + (mode === 'delivery' ? S.deliveryFee || 0 : 0));
    });
    ov.querySelector('#o-send').onclick = async (e) => {
      const err = ov.querySelector('#o-err'); err.textContent = '';
      const name = F.name.value.trim(); const phone = F.phone.value.trim(); const address = F.address.value.trim();
      if (name.length < 2) { err.textContent = 'Escribe tu nombre.'; return; }
      if (phone.replace(/\D/g, '').length < 7) { err.textContent = 'Escribe un teléfono válido.'; return; }
      if (mode === 'delivery' && address.length < 5) { err.textContent = 'Escribe la dirección de entrega.'; return; }
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Enviando…';
      const fee = mode === 'delivery' ? Number(S.deliveryFee) || 0 : 0;
      const order = {
        tenantId: S.tenantId, slug, number: 'W-' + code(5), name: name.slice(0, 60), phone: phone.slice(0, 20), address: mode === 'delivery' ? address.slice(0, 200) : '', mode, deliveryFee: fee,
        note: F.note.value.trim().slice(0, 300), payMethod: F.pay.value, hasRx,
        items: L.slice(0, 40).map((x) => ({ id: x.i.id, n: x.i.n, q: x.n, p: x.i.p, rx: !!x.i.rx })),
        total: Math.round((subtotal() + fee) * 100) / 100, status: 'nueva', createdAt: new Date().toISOString()
      };
      try {
        await addDoc(collection(db, 'orders'), order);
        cart = {}; save(); close(); done(order);
      } catch (ex) {
        console.error(ex);
        err.textContent = 'No se pudo enviar el pedido. Intenta de nuevo o escríbenos por WhatsApp.';
        btn.disabled = false; btn.innerHTML = `${icon('check')} Enviar pedido`;
      }
    };
  }

  function done(o) {
    const txt = `Hola, acabo de hacer el pedido *${o.number}* en línea a nombre de ${o.name} (${o.items.length} producto/s, ${money(o.total)}).`;
    root.querySelector('.shop-page').innerHTML = `<div class="pcard-page"><div class="mcard center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px;margin:0 auto">${icon('check')}</div>
      <h1 style="margin:12px 0 4px">¡Pedido enviado!</h1><p class="muted">Tu número de pedido es <b>${esc(o.number)}</b>. ${esc(S.shop)} lo está revisando y te escribirá por WhatsApp cuando esté listo${o.mode === 'delivery' ? ' para enviarlo' : ' para retirar'}.</p>
      <div class="summary-box" style="text-align:left">${o.items.map((i) => `<div class="summary-row"><span>${i.q} × ${esc(i.n)}</span><b>${money(i.p * i.q)}</b></div>`).join('')}<div class="summary-row total"><span>Total aproximado</span><span>${money(o.total)}</span></div></div>
      ${S.phone ? `<a class="btn btn-whatsapp btn-block mt" href="${waLink(S.phone, txt)}" target="_blank" rel="noopener">${icon('whatsapp')} Avisar por WhatsApp (opcional)</a>` : ''}
      <a class="btn btn-secondary btn-block mt" href="${location.pathname}">Hacer otro pedido</a></div></div>`;
    toast('Pedido enviado');
  }

  $('#s-q').oninput = debounce((e) => { q = e.target.value; drawGrid(); }, 120);
  $('#s-bar').onclick = checkout;
  drawCats(); drawGrid(); bar();
}
