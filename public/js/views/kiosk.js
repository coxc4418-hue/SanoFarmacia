// SanoFarmacia — Consulta de precios (kiosco): el cliente escanea el producto y ve el precio por caja, blíster o unidad
import { store } from '../store.js';
import { esc, usd, bs, normalize, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { requirePin } from '../auth.js';
import { packsOf, packPrice, packLabel, PACKS, rxOf, needsRx, searchText, productLine, equivalents, stockText } from '../pharma.js';

export function mount(el, { navigate }) {
  el.innerHTML = `<div class="pck">
    <button class="kiosk-exit" id="k-exit" title="Salir">${icon('lock')}</button>
    <div class="pck-head"><img src="/assets/logo.svg" alt=""><div><b>${esc(store.businessName)}</b><small>Consulta de precios</small></div><button class="btn btn-ghost btn-sm" id="k-fs">${icon('monitor')} Pantalla completa</button></div>
    <label class="pck-input">${icon('barcode')}<input id="k-q" placeholder="Escanea el código de barras o escribe el nombre…" autocomplete="off" autofocus></label>
    <div class="pck-body" id="k-body"></div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const mk = () => store.settings.fractionMarkup;
  let resetT = null;

  function idle() {
    $('#k-body').innerHTML = `<div class="pck-idle">${icon('barcode')}<h1>Pasa el producto por el lector</h1><p>Verás su precio por caja${store.settings.fx?.enabled ? ' en las dos monedas' : ''}, por blíster o por unidad, y si tenemos un equivalente más económico.</p></div>`;
  }
  function show(p) {
    clearTimeout(resetT);
    const eq = equivalents(p, store.products).filter((x) => (Number(x.stock) || 0) > 0 && Number(x.price) < Number(p.price)).slice(0, 3);
    const st = Number(p.stock) || 0;
    $('#k-body').innerHTML = `<div class="pck-card">
      <div class="pck-name">${esc(p.name)}</div><div class="pck-sub">${esc(productLine(p))}</div>
      <div class="pck-prices">${packsOf(p).map((k) => `<div class="pck-price ${k === 'caja' ? 'main' : ''}"><small>${esc(PACKS[k])} · ${esc(packLabel(p, k))}</small><b>${usd(packPrice(p, k, mk()))}</b>${bs(packPrice(p, k, mk())) ? `<span>${bs(packPrice(p, k, mk()))}</span>` : ''}</div>`).join('')}</div>
      <div class="row row-wrap" style="gap:8px;justify-content:center">${p.trackStock === false ? '' : st > 0 ? `<span class="badge badge-success" style="height:30px;font-size:14px">${icon('check')} Disponible</span>` : '<span class="badge badge-danger" style="height:30px;font-size:14px">Agotado</span>'}${needsRx(p) ? `<span class="badge badge-info" style="height:30px;font-size:14px">${icon('file')} ${esc(rxOf(p).label)}</span>` : ''}</div>
      ${eq.length ? `<div class="pck-eq"><b>${icon('sparkle')} Opciones más económicas con el mismo principio activo:</b>${eq.map((x) => `<div class="between"><span>${esc(x.name)} <small>${esc(x.lab || '')}</small></span><b>${usd(x.price)}</b></div>`).join('')}</div>` : ''}
    </div>`;
    resetT = setTimeout(idle, 25000);
  }
  function list(L) {
    clearTimeout(resetT);
    $('#k-body').innerHTML = `<div class="pck-list">${L.map((p) => `<button class="list-item" data-p="${p.id}"><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub">${esc(productLine(p))}${(Number(p.stock) || 0) <= 0 ? ' · agotado' : ''}</div></div><b class="num">${usd(p.price)}</b></button>`).join('')}</div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { show(store.product(b.dataset.p)); $('#k-q').value = ''; $('#k-q').focus(); });
    resetT = setTimeout(idle, 25000);
  }
  const inp = $('#k-q');
  inp.oninput = debounce(() => {
    const v = inp.value.trim(); if (v.length < 3) { if (!v && !el.querySelector('.pck-card')) idle(); return; }
    const t = normalize(v);
    const L = store.sellable.filter((p) => searchText(p).includes(t)).slice(0, 10);
    if (L.length) list(L); else $('#k-body').innerHTML = `<div class="pck-idle">${icon('search')}<h1>No encontrado</h1><p>Pregunta en el mostrador: te ayudamos a encontrarlo.</p></div>`;
  }, 250);
  inp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const p = store.byBarcode(inp.value);
    if (p) { show(p); inp.value = ''; return; }
    const L = store.sellable.filter((x) => searchText(x).includes(normalize(inp.value)));
    if (L.length === 1) { show(L[0]); inp.value = ''; }
  };
  const keepFocus = () => { if (document.activeElement !== inp && !document.querySelector('.modal-backdrop')) inp.focus(); };
  const iv = setInterval(keepFocus, 1500);
  $('#k-fs').onclick = () => { try { document.documentElement.requestFullscreen?.(); } catch (_) {} };
  $('#k-exit').onclick = async () => { if (await requirePin('Salir de la consulta de precios', { always: true })) navigate('inicio'); };
  idle();
  return () => { clearInterval(iv); clearTimeout(resetT); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {} };
}
