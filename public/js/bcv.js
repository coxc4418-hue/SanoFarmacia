// SanoFarmacia — Moneda y tasa de cambio.
// Venezuela: se trabaja en dólares y todo muestra su equivalente en bolívares a la tasa oficial del BCV
// (se actualiza sola cada día; también se puede escribir a mano). Otros países: su moneda local
// y, si se quiere, una segunda moneda con tasa manual.
import { store } from './store.js';
import { loc, dayKey, nowISO, num, esc, toast, parseNum, setBusy, fmtDateTime, flagImg } from './utils.js';
import { icon } from './icons.js';

export const BCV_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
/** Venezuela trabajando en dólares: usa la tasa BCV para los bolívares */
export const isVE = () => store.settings.country === 'VE' && loc().cur === 'USD';
const fxNow = () => store.settings.fx || {};

/** Consulta la tasa oficial del BCV (Bs por 1 USD) */
export async function fetchBCV() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(BCV_URL, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = Number(j.promedio || j.precio || j.venta);
    if (!(v > 0)) throw new Error('Respuesta inválida');
    return { rate: Math.round(v * 100) / 100, date: j.fechaActualizacion || null };
  } finally { clearTimeout(t); }
}

/** Trae la tasa BCV si hace falta (una vez al día) y la guarda como segunda moneda (Bs). */
export async function autoBcv({ force = false } = {}) {
  if (!isVE()) return false;
  const fx = fxNow();
  if (!force && fx.auto === false) {
    // Tasa manual: solo se asegura de que los bolívares estén activos
    if (!fx.enabled && Number(fx.rate) > 0) await store.saveSettings({ fx: { ...fx, enabled: true, sym: 'Bs', name: 'Bolívares' } });
    return false;
  }
  if (!force && fx.enabled && Number(fx.rate) > 0 && fx.source === 'BCV' && fx.updatedAt && dayKey(new Date(fx.updatedAt)) === dayKey()) return false;
  try {
    const { rate, date } = await fetchBCV();
    await store.saveSettings({ fx: { ...fx, enabled: true, sym: 'Bs', name: 'Bolívares', rate, auto: true, source: 'BCV', bcvDate: date, updatedAt: nowISO() } });
    store.emit('rate', rate);
    return rate;
  } catch (e) {
    console.warn('[bcv]', e?.message || e);
    if (!fx.enabled && Number(fx.rate) > 0) await store.saveSettings({ fx: { ...fx, enabled: true, sym: 'Bs', name: 'Bolívares' } });
    return false;
  }
}

/** Al cambiar de país: Venezuela activa la tasa BCV; otro país apaga los bolívares automáticos. */
export async function onCountryChanged() {
  if (isVE()) {
    const r = await autoBcv({ force: true });
    if (!r && !(Number(fxNow().rate) > 0)) toast('No se pudo traer la tasa BCV ahora. Escríbela en Configuración › Moneda y tasa.', 'warning', 6000);
  } else if (fxNow().source === 'BCV' && fxNow().enabled) {
    await store.saveSettings({ fx: { ...fxNow(), enabled: false } });
    store.emit('rate', 0);
  }
}

let timer = null;
/** Revisa la tasa al entrar y luego cada hora (por si cambió el día con la app abierta). */
export function startBcv() {
  autoBcv().catch(() => {});
  clearInterval(timer);
  timer = setInterval(() => autoBcv().catch(() => {}), 3600000);
}

/** Texto del botón de la barra superior: bandera, moneda y tasa del día */
export function rateChip() {
  const fx = fxNow();
  const on = fx.enabled && Number(fx.rate) > 0;
  return `${flagImg(loc().code)} ${esc(loc().cur)}${on ? ` <span class="rate-fx">${isVE() ? 'BCV ' : ''}${esc(fx.sym || 'Bs')} ${num(fx.rate, 2)}</span>` : ''}`;
}

const swHTML = (name, on, title, sub) => `<label class="check box box-white"><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span><span><b>${title}</b><br><small class="muted">${sub}</small></span></label>`;

/** Sección "Moneda y tasa" de Configuración */
export function fxSectionHTML() {
  const X = fxNow();
  if (isVE()) {
    return `<form class="card stack" id="f-fx">
      <div class="card-title">${icon('dollar')} Tasa BCV (bolívares)</div>
      <p class="small muted" style="margin:0">En Venezuela los precios se guardan en <b>dólares ($)</b> y el cobro, el vuelto, el ticket y el catálogo muestran su equivalente en <b>bolívares</b> a la tasa oficial del <b>BCV</b>.</p>
      <div class="bcv-box"><div><small class="muted">Tasa de hoy</small><div class="bcv-rate">Bs ${num(X.rate || 0, 2)} <small>por 1 $</small></div>
        <small class="muted">${X.updatedAt ? `${X.source === 'BCV' ? 'Oficial BCV' : 'Escrita a mano'} · actualizada ${esc(fmtDateTime(X.updatedAt))}` : 'Aún sin tasa'}</small></div>
        <button type="button" class="btn btn-secondary" id="fx-bcv">${icon('refresh')} Traer tasa BCV</button></div>
      ${swHTML('auto', X.auto !== false, 'Actualizar sola cada día con la tasa oficial del BCV', 'Si la apagas, se usa la tasa que escribas abajo.')}
      <div class="form-grid">
        <div class="field"><label>Tasa manual: 1 $ =</label><input class="input input-lg" name="rate" inputmode="decimal" value="${X.rate ? num(X.rate, 2) : ''}" placeholder="0,00"><span class="hint">Bolívares por cada dólar.</span></div>
      </div>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar tasa</button></div>
    </form>`;
  }
  return `<form class="card stack" id="f-fx">
    <div class="card-title">${icon('dollar')} Segunda moneda (tasa de cambio)</div>
    <p class="small muted" style="margin:0">Los precios se guardan en ${esc(loc().curName)} (${esc(loc().sym)}). Si cobras también en otra moneda, actívala: el total, el vuelto y el ticket muestran el equivalente con la tasa que escribas.</p>
    ${swHTML('enabled', X.enabled, 'Mostrar equivalente en otra moneda', 'Actualiza la tasa cuando cambie.')}
    <div class="form-grid">
      <div class="field"><label>Símbolo</label><input class="input" name="sym" value="${esc(X.source === 'BCV' ? 'US$' : (X.sym || 'US$'))}" maxlength="4"></div>
      <div class="field"><label>Nombre</label><input class="input" name="name" value="${esc(X.source === 'BCV' ? 'Dólares' : (X.name || 'Dólares'))}"></div>
      <div class="field"><label>Tasa: 1 ${esc(loc().sym)} =</label><input class="input input-lg" name="rate" inputmode="decimal" value="${X.rate && X.source !== 'BCV' ? num(X.rate, 4) : ''}" placeholder="0,00"></div>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div>
  </form>`;
}

export function bindFxSection(root, rerender) {
  const f = root.querySelector('#f-fx');
  if (!f) return;
  const bcvBtn = root.querySelector('#fx-bcv');
  if (bcvBtn) bcvBtn.onclick = async () => {
    setBusy(bcvBtn, true, 'Consultando…');
    const r = await autoBcv({ force: true });
    setBusy(bcvBtn, false);
    if (r) toast(`Tasa BCV de hoy: Bs ${num(r, 2)}`); else toast('No se pudo consultar el BCV. Escribe la tasa a mano.', 'warning', 5000);
    rerender?.();
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const F = e.target.elements;
    const rate = parseNum(F.rate.value);
    if (isVE()) {
      const auto = F.auto.checked;
      if (!auto && !(rate > 0)) { toast('Escribe la tasa del día', 'warning'); return; }
      if (auto) { const r = await autoBcv({ force: true }); if (r) { toast(`Tasa BCV: Bs ${num(r, 2)}`); rerender?.(); return; } }
      await store.saveSettings({ fx: { ...fxNow(), enabled: true, sym: 'Bs', name: 'Bolívares', rate: rate || fxNow().rate || 0, auto, source: auto ? (fxNow().source || 'BCV') : 'manual', updatedAt: nowISO() } });
      store.emit('rate', rate);
      toast('Tasa guardada'); rerender?.();
      return;
    }
    if (F.enabled.checked && !(rate > 0)) { toast('Escribe la tasa de cambio', 'warning'); return; }
    await store.saveSettings({ fx: { enabled: F.enabled.checked, sym: F.sym.value.trim() || 'US$', name: F.name.value.trim(), rate, auto: false, source: 'manual', updatedAt: nowISO() } });
    store.emit('rate', rate);
    toast('Moneda guardada'); rerender?.();
  };
}
