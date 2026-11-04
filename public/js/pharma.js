// SanoFarmacia — Conocimiento de farmacia: presentaciones, condición de venta, fraccionado, lotes (FEFO) y equivalentes
import { round2, normalize, todayKey, dayKey, addDays, fromKey, qtyFmt } from './utils.js';

export const FORMS = ['Tableta', 'Tableta recubierta', 'Cápsula', 'Comprimido efervescente', 'Jarabe', 'Suspensión', 'Gotas', 'Solución oral', 'Crema', 'Ungüento', 'Gel', 'Loción', 'Inyectable', 'Ampolla', 'Óvulo', 'Supositorio', 'Inhalador', 'Spray nasal', 'Colirio', 'Sobre / polvo', 'Parche', 'Otro'];

export const CATEGORIES = ['Analgésicos y antiinflamatorios', 'Antibióticos', 'Antigripales y respiratorios', 'Gastrointestinales', 'Cardiovasculares', 'Diabetes', 'Antialérgicos', 'Dermatológicos', 'Sistema nervioso', 'Vitaminas y suplementos', 'Bebé y maternidad', 'Cuidado personal', 'Material médico', 'Ortopedia', 'Servicios farmacéuticos', 'Otros'];

/** Condición de venta */
export const RX = {
  libre: { label: 'Venta libre', short: 'Libre', tone: 'success', icon: 'checkCircle', needs: false },
  receta: { label: 'Con receta médica', short: 'Rx', tone: 'info', icon: 'file', needs: true },
  antibiotico: { label: 'Antibiótico (retiene receta)', short: 'ATB', tone: 'warning', icon: 'shield', needs: true, retain: true },
  controlado: { label: 'Controlado / psicotrópico', short: 'Control.', tone: 'danger', icon: 'lock', needs: true, retain: true, book: true }
};
export const rxOf = (p) => RX[p?.rx] || RX.libre;
export const needsRx = (p) => !!rxOf(p).needs;
export const rxBadge = (p, short = false) => (p?.rx && p.rx !== 'libre' ? `<span class="badge badge-${rxOf(p).tone}">${short ? rxOf(p).short : rxOf(p).label}</span>` : '');

/** Mediciones del servicio farmacéutico */
export const MEASURES = {
  tension: { label: 'Tensión arterial', unit: 'mmHg', two: true, icon: 'pulse', hint: 'Sistólica / diastólica' },
  glucosa: { label: 'Glucosa', unit: 'mg/dL', icon: 'droplet', hint: 'En ayunas o casual' },
  peso: { label: 'Peso', unit: 'kg', icon: 'scale' },
  temperatura: { label: 'Temperatura', unit: '°C', icon: 'thermometer' },
  saturacion: { label: 'Saturación de oxígeno', unit: '%', icon: 'heart' },
  colesterol: { label: 'Colesterol', unit: 'mg/dL', icon: 'flask' }
};
/** Interpretación orientativa (no sustituye criterio médico) */
export function measureFlag(type, v, v2) {
  const n = Number(v) || 0; const d = Number(v2) || 0;
  if (type === 'tension') { if (n >= 140 || d >= 90) return ['Alta', 'danger']; if (n >= 130 || d >= 85) return ['Elevada', 'warning']; if (n && n < 90) return ['Baja', 'info']; return ['Normal', 'success']; }
  if (type === 'glucosa') { if (n >= 126) return ['Alta', 'danger']; if (n >= 100) return ['Elevada', 'warning']; if (n && n < 70) return ['Baja', 'info']; return ['Normal', 'success']; }
  if (type === 'temperatura') { if (n >= 38) return ['Fiebre', 'danger']; if (n >= 37.3) return ['Febrícula', 'warning']; return ['Normal', 'success']; }
  if (type === 'saturacion') { if (n && n < 92) return ['Baja', 'danger']; if (n && n < 95) return ['Vigilar', 'warning']; return ['Normal', 'success']; }
  if (type === 'colesterol') { if (n >= 240) return ['Alto', 'danger']; if (n >= 200) return ['Límite', 'warning']; return ['Normal', 'success']; }
  return ['', 'neutral'];
}

export const CONDITIONS = ['Hipertensión', 'Diabetes', 'Asma', 'Colesterol alto', 'Hipotiroidismo', 'Artritis', 'Gastritis', 'Embarazo', 'Lactancia', 'Insuficiencia renal', 'Epilepsia', 'Depresión / ansiedad'];
export const ALLERGIES = ['Penicilina', 'Sulfas', 'AINES (ibuprofeno, aspirina)', 'Dipirona', 'Látex', 'Yodo', 'Mariscos'];

export const LOYALTY_DEFAULT = { enabled: true, per: 1, pointValue: 0.05, minRedeem: 100 };

// ======================================================================
// FRACCIONADO: el stock se guarda en UNIDADES (tabletas, ampollas, frascos…)
// ======================================================================
export const PACKS = { caja: 'Caja', blister: 'Blíster', unidad: 'Unidad' };
/** Unidades por caja */
export const upb = (p) => Math.max(1, Math.round(Number(p?.unitsPerBox) || 1));
export const fractionable = (p) => upb(p) > 1 && p?.fraction !== false;
export const hasBlister = (p) => fractionable(p) && Number(p?.blister) > 1 && Number(p.blister) < upb(p);
/** Cuántas unidades trae cada presentación */
export function packFactor(p, pack) {
  if (pack === 'unidad') return 1;
  if (pack === 'blister') return hasBlister(p) ? Math.round(Number(p.blister)) : upb(p);
  return upb(p);
}
/** Presentaciones que se pueden vender de este producto */
export function packsOf(p) {
  const out = ['caja'];
  if (hasBlister(p)) out.push('blister');
  if (fractionable(p)) out.push('unidad');
  return out;
}
/** Precio de venta de una presentación (la caja es el precio base; fraccionar tiene un recargo opcional) */
export function packPrice(p, pack, markup = 0) {
  const box = Number(p?.price) || 0;
  if (pack === 'caja' || !fractionable(p)) return round2(box);
  if (pack === 'unidad' && Number(p.unitPrice) > 0) return round2(p.unitPrice);
  if (pack === 'blister' && Number(p.blisterPrice) > 0) return round2(p.blisterPrice);
  const k = 1 + (Number(markup) || 0) / 100;
  return round2((box / upb(p)) * packFactor(p, pack) * k);
}
export const unitCost = (p) => (Number(p?.cost) || 0) / upb(p);
export const packLabel = (p, pack, qty = 1) => {
  if (!fractionable(p) || pack === 'caja') return qty === 1 ? (upb(p) > 1 ? `Caja x${upb(p)}` : 'Unidad') : `${upb(p) > 1 ? 'Cajas' : 'Unidades'}`;
  if (pack === 'blister') return `Blíster x${packFactor(p, 'blister')}`;
  return 'Unidad suelta';
};
/** "3 cajas + 5 und" */
export function stockText(p, units = p?.stock) {
  const u = Math.max(0, Math.round(Number(units) || 0));
  const k = upb(p);
  if (k <= 1) return `${qtyFmt(u)}`;
  const b = Math.floor(u / k); const r = u % k;
  if (!b) return `${r} und`;
  return `${b} caja${b === 1 ? '' : 's'}${r ? ` + ${r} und` : ''}`;
}
export const boxesOf = (p, units = p?.stock) => (Number(units) || 0) / upb(p);

// ======================================================================
// LOTES Y VENCIMIENTOS (FEFO: lo que vence primero, sale primero)
// ======================================================================
export const lotsOf = (p) => (p?.lots || []).filter((l) => (Number(l.qty) || 0) > 0).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
export const nextExpiry = (p) => lotsOf(p).find((l) => l.exp)?.exp || '';
/** Saca `units` de los lotes empezando por el que vence primero. Devuelve los lotes nuevos y lo que salió de cada uno. */
export function consumeLots(lots, units) {
  const list = (lots || []).map((l) => ({ ...l })).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
  let left = Math.max(0, Number(units) || 0);
  const used = [];
  for (const l of list) {
    if (left <= 0) break;
    const q = Math.min(Number(l.qty) || 0, left);
    if (q <= 0) continue;
    l.qty = (Number(l.qty) || 0) - q; left -= q;
    used.push({ lot: l.lot || '', exp: l.exp || '', qty: q });
  }
  return { lots: list.filter((l) => l.qty > 0), used, missing: left };
}
/** Devuelve unidades a sus lotes (anulación o devolución) */
export function restoreLots(lots, used) {
  const list = (lots || []).map((l) => ({ ...l }));
  for (const u of used || []) {
    const hit = list.find((l) => (l.lot || '') === (u.lot || '') && (l.exp || '') === (u.exp || ''));
    if (hit) hit.qty = (Number(hit.qty) || 0) + u.qty; else list.push({ lot: u.lot || '', exp: u.exp || '', qty: u.qty });
  }
  return list.sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
}
/** Agrega una entrada a un lote (si ya existe el mismo lote y fecha, suma) */
export function addLot(lots, { lot = '', exp = '', qty = 0, cost = 0 }) {
  const list = (lots || []).map((l) => ({ ...l }));
  const hit = list.find((l) => (l.lot || '') === lot && (l.exp || '') === exp);
  if (hit) hit.qty = (Number(hit.qty) || 0) + qty; else list.push({ lot, exp, qty, cost: round2(cost), in: todayKey() });
  return list.filter((l) => l.qty > 0).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
}
/** Días que faltan para vencer (negativo = vencido) */
export const daysToExpiry = (exp) => (exp ? Math.round((fromKey(exp) - fromKey(todayKey())) / 864e5) : null);
export function expiryTone(exp) {
  const d = daysToExpiry(exp);
  if (d == null) return ['', 'neutral'];
  if (d < 0) return ['Vencido', 'danger'];
  if (d <= 30) return [`Vence en ${d} d`, 'danger'];
  if (d <= 60) return [`Vence en ${d} d`, 'warning'];
  if (d <= 90) return [`Vence en ${d} d`, 'info'];
  return [`Vence ${exp.slice(5, 7)}/${exp.slice(2, 4)}`, 'neutral'];
}
export const expBadge = (exp) => { if (!exp) return ''; const [t, tone] = expiryTone(exp); return `<span class="badge badge-${tone}">${t}</span>`; };
export const limitDay = (days) => dayKey(addDays(new Date(), days));

// ======================================================================
// EQUIVALENTES (mismo principio activo y concentración)
// ======================================================================
const key = (s) => normalize(s).replace(/[^a-z0-9]+/g, ' ').trim();
export const molecule = (p) => key(p?.active || '');
export const strengthKey = (p) => key(p?.strength || '').replace(/\s+/g, '');
export function equivalents(p, products) {
  const m = molecule(p);
  if (!m) return [];
  const s = strengthKey(p);
  return products.filter((x) => x.id !== p.id && x.active !== false && x.sellable !== false && molecule(x) === m && (!s || !strengthKey(x) || strengthKey(x) === s))
    .sort((a, b) => (Number(a.price) / upb(a)) - (Number(b.price) / upb(b)));
}
/** Texto de búsqueda de un producto */
export const searchText = (p) => normalize(`${p.name} ${p.active || ''} ${p.strength || ''} ${p.form || ''} ${p.lab || ''} ${p.barcode || ''} ${p.sku || ''} ${p.category || ''} ${p.location || ''}`);
export const productLine = (p) => [p.active && p.active !== p.name ? p.active : '', p.strength, p.form, upb(p) > 1 ? `x${upb(p)}` : '', p.lab].filter(Boolean).join(' · ');
