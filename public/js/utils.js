// SanoFarmacia — Utilidades compartidas
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Números y moneda ----------
const nfCache = {};
export function num(n, d = 2) {
  const v = Number(n);
  if (!isFinite(v)) return d ? '0,' + '0'.repeat(d) : '0';
  const k = d;
  nfCache[k] ||= new Intl.NumberFormat('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
  return nfCache[k].format(Math.abs(v) < 0.005 && d === 2 ? 0 : v);
}
// ---------- País y moneda de trabajo (se elige la primera vez que se entra) ----------
const M = (label, color, cash = false) => ({ label, color, cash });
const BASE_METHODS = { efectivo: M('Efectivo', '#16a34a', true), debito: M('Tarjeta de débito', '#2563eb'), credito: M('Tarjeta de crédito', '#4f46e5'), transferencia: M('Transferencia', '#0891b2') };
const EXTRA_METHODS = {
  pagomovil: M('Pago móvil', '#7c3aed'), zelle: M('Zelle', '#6d28d9'), binance: M('Binance / USDT', '#ca8a04'), nequi: M('Nequi', '#db2777'), daviplata: M('Daviplata', '#dc2626'),
  mercadopago: M('Mercado Pago', '#0ea5e9'), yape: M('Yape', '#7c3aed'), plin: M('Plin', '#0d9488'), pix: M('Pix', '#0d9488'), qr: M('Pago QR', '#7c3aed'), sinpe: M('SINPE Móvil', '#7c3aed'),
  yappy: M('Yappy', '#ea580c'), deuna: M('DeUna', '#7c3aed'), spei: M('SPEI / CoDi', '#7c3aed'), webpay: M('Webpay', '#dc2626'), tigo: M('Tigo Money', '#2563eb')
};
/** Países de Latinoamérica: moneda, prefijo telefónico, formas de pago y nombres de documentos */
export const COUNTRIES = {
  AR: { name: 'Argentina', flag: '🇦🇷', cur: 'ARS', curName: 'Peso argentino', sym: '$', dec: 2, dial: '54', tax: 'CUIT', id: 'DNI', lic: 'Matrícula', extra: ['mercadopago'] },
  BO: { name: 'Bolivia', flag: '🇧🇴', cur: 'BOB', curName: 'Boliviano', sym: 'Bs', dec: 2, dial: '591', tax: 'NIT', id: 'C.I.', lic: 'Matrícula profesional', extra: ['qr', 'tigo'] },
  BR: { name: 'Brasil', flag: '🇧🇷', cur: 'BRL', curName: 'Real brasileño', sym: 'R$', dec: 2, dial: '55', tax: 'CNPJ', id: 'CPF', lic: 'CRO', extra: ['pix'] },
  CL: { name: 'Chile', flag: '🇨🇱', cur: 'CLP', curName: 'Peso chileno', sym: '$', dec: 0, dial: '56', tax: 'RUT', id: 'RUT', lic: 'Registro SIS', extra: ['webpay'] },
  CO: { name: 'Colombia', flag: '🇨🇴', cur: 'COP', curName: 'Peso colombiano', sym: '$', dec: 0, dial: '57', tax: 'NIT', id: 'C.C.', lic: 'Tarjeta profesional', extra: ['nequi', 'daviplata'] },
  CR: { name: 'Costa Rica', flag: '🇨🇷', cur: 'CRC', curName: 'Colón costarricense', sym: '₡', dec: 0, dial: '506', tax: 'Cédula jurídica', id: 'Cédula', lic: 'Código del Colegio', extra: ['sinpe'] },
  CU: { name: 'Cuba', flag: '🇨🇺', cur: 'CUP', curName: 'Peso cubano', sym: '$', dec: 2, dial: '53', tax: 'NIT', id: 'C.I.', lic: 'Registro profesional', extra: [] },
  EC: { name: 'Ecuador', flag: '🇪🇨', cur: 'USD', curName: 'Dólar estadounidense', sym: '$', dec: 2, dial: '593', tax: 'RUC', id: 'C.I.', lic: 'Registro SENESCYT', extra: ['deuna'] },
  SV: { name: 'El Salvador', flag: '🇸🇻', cur: 'USD', curName: 'Dólar estadounidense', sym: '$', dec: 2, dial: '503', tax: 'NIT', id: 'DUI', lic: 'JVPO', extra: [] },
  GT: { name: 'Guatemala', flag: '🇬🇹', cur: 'GTQ', curName: 'Quetzal', sym: 'Q', dec: 2, dial: '502', tax: 'NIT', id: 'DPI', lic: 'Colegiado', extra: [] },
  HN: { name: 'Honduras', flag: '🇭🇳', cur: 'HNL', curName: 'Lempira', sym: 'L', dec: 2, dial: '504', tax: 'RTN', id: 'DNI', lic: 'Colegiación', extra: ['tigo'] },
  MX: { name: 'México', flag: '🇲🇽', cur: 'MXN', curName: 'Peso mexicano', sym: '$', dec: 2, dial: '52', tax: 'RFC', id: 'CURP', lic: 'Cédula profesional', extra: ['spei', 'mercadopago'] },
  NI: { name: 'Nicaragua', flag: '🇳🇮', cur: 'NIO', curName: 'Córdoba', sym: 'C$', dec: 2, dial: '505', tax: 'RUC', id: 'Cédula', lic: 'Registro MINSA', extra: [] },
  PA: { name: 'Panamá', flag: '🇵🇦', cur: 'USD', curName: 'Dólar estadounidense (balboa)', sym: '$', dec: 2, dial: '507', tax: 'RUC', id: 'Cédula', lic: 'Registro de idoneidad', extra: ['yappy'] },
  PY: { name: 'Paraguay', flag: '🇵🇾', cur: 'PYG', curName: 'Guaraní', sym: '₲', dec: 0, dial: '595', tax: 'RUC', id: 'C.I.', lic: 'Registro profesional', extra: ['qr'] },
  PE: { name: 'Perú', flag: '🇵🇪', cur: 'PEN', curName: 'Sol peruano', sym: 'S/', dec: 2, dial: '51', tax: 'RUC', id: 'DNI', lic: 'COP', extra: ['yape', 'plin'] },
  PR: { name: 'Puerto Rico', flag: '🇵🇷', cur: 'USD', curName: 'Dólar estadounidense', sym: '$', dec: 2, dial: '1', tax: 'EIN', id: 'ID', lic: 'Licencia', extra: [] },
  DO: { name: 'República Dominicana', flag: '🇩🇴', cur: 'DOP', curName: 'Peso dominicano', sym: 'RD$', dec: 2, dial: '1', tax: 'RNC', id: 'Cédula', lic: 'Exequátur', extra: [] },
  UY: { name: 'Uruguay', flag: '🇺🇾', cur: 'UYU', curName: 'Peso uruguayo', sym: '$', dec: 2, dial: '598', tax: 'RUT', id: 'C.I.', lic: 'Registro MSP', extra: ['mercadopago'] },
  VE: { name: 'Venezuela', flag: '🇻🇪', cur: 'USD', curName: 'Dólar estadounidense', sym: '$', dec: 2, dial: '58', tax: 'RIF', id: 'C.I.', lic: 'COV', lic2: 'MPPS', idTypes: ['V', 'E', 'P', 'J'], extra: ['pagomovil', 'zelle', 'binance'], alt: { cur: 'VES', curName: 'Bolívar', sym: 'Bs', dec: 2 } }
};
let LOC = { code: '', ...COUNTRIES.VE };
/** Configuración regional actual: { code, name, flag, cur, sym, dec, dial, tax, id, lic, ... } */
export const loc = () => LOC;
/** Equivalencia aproximada de 1 USD en cada moneda: solo para adaptar los precios de ejemplo del arancel inicial y de la demo */
export const USD_FX = { USD: 1, ARS: 1200, BOB: 7, BRL: 5.5, CLP: 950, COP: 4000, CRC: 510, CUP: 120, GTQ: 7.7, HNL: 26, MXN: 18.5, NIO: 37, PAB: 1, PYG: 7800, PEN: 3.7, DOP: 62, UYU: 40, VES: 200 };
/** Precio redondeado "bonito" para la moneda (2 cifras significativas en montos grandes) */
export function niceMoney(v, dec = 2) {
  v = Number(v) || 0;
  if (v < 100) return dec ? Math.round(v * 100) / 100 : Math.round(v);
  const step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / step) * step;
}
export const scaleUSD = (v, cur = LOC.cur, dec = LOC.dec) => (cur === 'USD' ? v : niceMoney(v * (USD_FX[cur] || 1), dec));
/** Bandera del país como imagen (Windows no dibuja los emojis de banderas) */
export const flagImg = (code, h = 16) => code ? `<img class="flag-img" src="https://flagcdn.com/h40/${String(code).toLowerCase()}.png" alt="" width="${Math.round(h * 4 / 3)}" height="${h}" loading="lazy">` : '';
export const PAY_METHODS = {};
/** Aplica el país (y opcionalmente la moneda alternativa) en toda la app */
export function applyLocale(code, cur = null) {
  const c = COUNTRIES[code] || COUNTRIES.VE;
  LOC = { code: COUNTRIES[code] ? code : '', ...c, ...(cur && c.alt && cur === c.alt.cur ? c.alt : {}) };
  for (const k of Object.keys(PAY_METHODS)) delete PAY_METHODS[k];
  Object.assign(PAY_METHODS, BASE_METHODS);
  for (const k of c.extra || []) PAY_METHODS[k] = EXTRA_METHODS[k];
  for (const k of Object.keys(PAY_METHODS)) PAY_METHODS[k] = { ...PAY_METHODS[k], cur: 'USD' };
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--pfx-w', `${Math.max(1, LOC.sym.length) * 9}px`);
  return LOC;
}
applyLocale('VE');
/** Monto en la moneda de trabajo: "$ 120.000" (COP), "S/ 85,00" (PEN)… */
export const usd = (n) => `${LOC.sym} ${num(n, LOC.dec)}`;
// ---------- Segunda moneda (opcional): p. ej. precios en $ y su equivalente en Bs a la tasa del día ----------
let FX = null;
/** fx: { enabled, sym, name, rate } — rate = cuánto vale 1 de la moneda de trabajo en la segunda moneda */
export function setFx(fx) { FX = fx && fx.enabled && Number(fx.rate) > 0 ? { sym: fx.sym || 'Bs', name: fx.name || '', rate: Number(fx.rate) } : null; }
export const fx = () => FX;
/** Equivalente en la segunda moneda ("Bs 1.234,50") o '' si no está activa */
export const bs = (n) => (FX ? `${FX.sym} ${num((Number(n) || 0) * FX.rate, 2)}` : '');
export const money = usd;
export function qtyFmt(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : num(v, v * 100 % 1 === 0 ? 2 : 3);
}
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
export function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
export function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  // Soporta "1.234,56", "1234,56" y "1234.56"
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "120.000" = ciento veinte mil
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ---------- Fechas (hora local del dispositivo) ----------
const pad = (n) => String(n).padStart(2, '0');
export function dayKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
export const todayKey = () => dayKey(new Date());
export function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function endOfDay(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function fromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
export function fmtDate(v) { if (!v) return '—'; const d = new Date(v.length === 10 ? fromKey(v) : v); return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
export const shortDate = (k) => (k && k.length >= 10 ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : fmtDate(k));
export function fmtDateTime(v) { if (!v) return '—'; return new Date(v).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
export function fmtTime(v) { if (!v) return '—'; return new Date(v).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }); }
export function fmtLongDate(d = new Date()) { const t = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
export const nowISO = () => new Date().toISOString();
/** "hace 5 min", "hace 1 h 20 min" */
export function fmtAgo(v) {
  if (!v) return '';
  const m = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function minutesSince(v) { return v ? Math.max(0, (Date.now() - new Date(v).getTime()) / 60000) : 0; }
export function shortId(n = 8) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => a[x % a.length]).join('');
}

export function docNumber(prefix) {
  const d = new Date();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${r}`;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function initials(name) {
  const w = String(name || '?').trim().split(/\s+/);
  const last = w[w.length - 1];
  if (w.length > 1 && /^\d+$/.test(last)) return last.slice(-2);
  return w.map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
}
export function colorFor(text) {
  let h = 0; for (const c of String(text || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${Math.round((h * 137.508) % 360)} 55% 42%)`;
}
export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------- Métodos de pago ----------
export const methodLabel = (m) => PAY_METHODS[m]?.label || EXTRA_METHODS[m]?.label || BASE_METHODS[m]?.label || ({ efectivo_usd: 'Efectivo', efectivo_bs: 'Efectivo', punto: 'Punto de venta', biopago: 'Biopago', mixto: 'Mixto' })[m] || m || 'Otro';

// ---------- Toasts ----------
export function toast(message, type = 'success', ms = 2800) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i></i><span>${esc(message)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, ms);
}

// ---------- Modales ----------
const modalStack = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) {
    const top = modalStack[modalStack.length - 1];
    if (top.dismissible) top.close();
  }
});

/**
 * openModal({ title, sub, body, footer, size, dismissible, onClose }) → { el, close, body }
 * body/footer: HTML string. Devuelve el elemento para enlazar eventos.
 */
export function openModal({ title = '', sub = '', body = '', footer = '', size = '', dismissible = true, onClose } = {}) {
  const host = document.getElementById('modals');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true">
      ${title ? `<div class="modal-header"><div><div class="modal-title">${title}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ''}</div>
        ${dismissible ? `<button type="button" class="x-btn" data-close aria-label="Cerrar">${icon('x')}</button>` : ''}</div>` : ''}
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>`;
  host.appendChild(wrap);
  let closed = false;
  const api = {
    el: wrap,
    dismissible,
    close() {
      if (closed) return; closed = true;
      wrap.remove();
      const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1);
      if (onClose) onClose();
    }
  };
  modalStack.push(api);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissible) api.close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
  setTimeout(() => { if (wrap.contains(document.activeElement)) return; const f = wrap.querySelector('[autofocus]'); if (f) { f.focus(); if (f.select) f.select(); } }, 60);
  return api;
}
export function closeAllModals() { [...modalStack].forEach((m) => m.close()); }

export function confirmDialog({ title = '¿Confirmar?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'sm',
      body: `<p class="muted">${message}</p>`,
      footer: `<button class="btn btn-secondary" data-no>${cancelText}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes autofocus>${confirmText}</button>`,
      onClose: () => { if (!done) resolve(false); }
    });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { done = true; m.close(); resolve(true); };
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', type = 'text', confirmText = 'Guardar' }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>${label}</label><input class="input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus step="any"></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${confirmText}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const submit = (e) => { e?.preventDefault(); done = true; const v = m.el.querySelector('input').value; m.close(); resolve(v); };
    m.el.querySelector('[data-f]').onsubmit = submit;
    m.el.querySelector('[data-ok]').onclick = submit;
  });
}

// ---------- Archivos ----------
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function toCSV(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Punto y coma: Excel en español lo abre en columnas directamente
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
export function parseCSV(text) {
  const sep = (text.split(/\r?\n/)[0].match(/;/g) || []).length >= (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== '')).map((r) => r.map((x) => x.replace(/^﻿/, '').trim()));
}

export function compressImage(file, max = 320, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Imprime HTML en un iframe oculto (no depende de ventanas emergentes)
export function printHTML(html) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const d = frame.contentWindow.document;
  d.open(); d.write(html); d.close();
  const go = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.warn(e); }
    setTimeout(() => frame.remove(), 2000);
  };
  if (d.readyState === 'complete') setTimeout(go, 250); else frame.onload = () => setTimeout(go, 150);
}

export function emptyState(ic, title, text = '') {
  return `<div class="empty">${icon(ic)}<b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>`;
}

export function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) { btn.dataset.txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>${text ? ' ' + text : ''}`; }
  else { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
}

export function waLink(phone, text) {
  const raw = String(phone || '').trim();
  let p = raw.replace(/\D/g, '');
  const dial = LOC.dial || '58';
  if (raw.startsWith('+')) { /* ya trae el código de país */ }
  else if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = dial + p.replace(/^0+/, '');
  else if (!(p.startsWith(dial) && p.length > 10)) p = dial + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('sf_theme', next); } catch (_) {}
  document.querySelectorAll('#sb-theme').forEach((b) => { b.innerHTML = icon(next === 'dark' ? 'sun' : 'moon'); });
  return next;
}
