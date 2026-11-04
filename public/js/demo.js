// SanoFarmacia — Modo demo (sesión anónima de 30 minutos) con una farmacia de ejemplo llena de vida
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, query, where, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS } from './store.js';
import { fmtSeq, genCode, cardData, clientFields, openShift, chargeSale, cashMovement, receivePurchase, createPurchaseOrder, setOrderStatus, cartTotals, agreementCalc, slugify } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, sha256, scaleUSD, PAY_METHODS } from './utils.js';
import { addLot, nextExpiry, packFactor, packPrice, unitCost, upb, hasBlister, LOYALTY_DEFAULT } from './pharma.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['clients', 'products', 'sales', 'prescriptions', 'measures', 'purchases', 'suppliers', 'cash_shifts', 'cash_movements', 'inventory_logs', 'config'];
const BIZ = 'Farmacia Santa Rosa (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const AGREEMENTS = [
  { id: 'a_seguro', name: 'Seguros La Previsora', discount: 0, coverage: 80, scope: 'medicamentos', contact: 'Reembolsos: 0212-5551100', active: true },
  { id: 'a_jubilados', name: 'Plan Tercera Edad', discount: 10, coverage: 0, scope: 'todo', contact: 'Mayores de 60 con cédula', active: true },
  { id: 'a_empresa', name: 'Empleados Constructora Andina', discount: 5, coverage: 50, scope: 'medicamentos', contact: 'RR. HH.: rrhh@andina.demo', active: true }
];
const SELLERS = [
  { id: 's1', name: 'Marianela Ortiz', role: 'Farmacéutica regente', active: true },
  { id: 's2', name: 'Carlos Peña', role: 'Auxiliar de farmacia', active: true },
  { id: 's3', name: 'Daniela Rivas', role: 'Cajera', active: true }
];

export async function createDemoTenant(uid) {
  const expiresAt = Timestamp.fromMillis(Date.now() + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();
  const ref = (name, id) => doc(db, 'tenants', uid, name, id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: 'J-50000000-0', phone: '0212-5550000', whatsapp: '0414-5550000', email: 'demo@sanofarmacia.app',
    address: 'Av. Principal de Santa Rosa, local 12', instagram: '@farmaciasantarosa', schedule: 'Lun a sáb 7:00 a 22:00 · Dom 8:00 a 14:00',
    pharmacist: 'Farm. Marianela Ortiz', pharmacistLicense: 'MPPS 18.452', sanitaryLicense: 'Permiso sanitario 2026-0457',
    agreements: AGREEMENTS, sellers: SELLERS, loyalty: { ...LOYALTY_DEFAULT },
    shop: { ...DEFAULT_SETTINGS.shop, enabled: true, slug: `${slugify('Farmacia Santa Rosa')}-${uid.slice(0, 4).toLowerCase()}`, note: 'Delivery en 45 min · Pago al recibir' },
    receiptFooter: '¡Gracias por su compra! Su salud es nuestra prioridad. 💚'
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}
const at = (daysAgo, h, m = 0) => { const d = addDays(new Date(), -daysAgo); d.setHours(h, m, 0, 0); return d; };
const inDays = (n) => dayKey(addDays(new Date(), n));
const birth = (age, mOff, d) => { const t = new Date(); return `${t.getFullYear() - age}-${String(((t.getMonth() + mOff) % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const birthdayIn = (age, days) => { const t = addDays(new Date(), days); return `${new Date().getFullYear() - age}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
/** Generador pseudoaleatorio con semilla (la demo sale igual cada vez) */
function rng(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const C_ANALG = 'Analgésicos y antiinflamatorios';
/** k, nombre, principio activo, concentración, forma, laboratorio, categoría, condición, und/caja, und/blíster, precio caja, costo caja, cajas, mínimo (cajas), lotes [[lote, vence en días, cajas]], ubicación */
const PRODUCTS = [
  ['acet', 'Acetaminofén 500 mg', 'Acetaminofén', '500 mg', 'Tableta', 'Genven', C_ANALG, 'libre', 20, 10, 2.5, 1.2, 40, 10, [['AC2311', 25, 4], ['AC2402', 420, 36]], 'A1'],
  ['atamel', 'Atamel 500 mg', 'Acetaminofén', '500 mg', 'Tableta', 'Calox', C_ANALG, 'libre', 20, 10, 4.2, 2.3, 18, 6, null, 'A1'],
  ['ibu', 'Ibuprofeno 400 mg', 'Ibuprofeno', '400 mg', 'Tableta recubierta', 'Leti', C_ANALG, 'libre', 10, 10, 2.8, 1.3, 25, 8, null, 'A2'],
  ['ibus', 'Ibuprofeno suspensión 100 mg/5 ml', 'Ibuprofeno', '100 mg/5 ml', 'Suspensión', 'Leti', C_ANALG, 'libre', 1, 0, 4.5, 2.4, 6, 4, [['IBS221', -5, 1], ['IBS240', 300, 5]], 'A2'],
  ['diclo', 'Diclofenac potásico 50 mg', 'Diclofenac', '50 mg', 'Tableta', 'Elter', C_ANALG, 'libre', 20, 10, 3.2, 1.5, 3, 6, null, 'A3'],
  ['amox', 'Amoxicilina 500 mg', 'Amoxicilina', '500 mg', 'Cápsula', 'Genven', 'Antibióticos', 'antibiotico', 21, 7, 6.5, 3.4, 15, 5, null, 'B1'],
  ['amoxs', 'Amoxicilina suspensión 250 mg/5 ml', 'Amoxicilina', '250 mg/5 ml', 'Suspensión', 'Genven', 'Antibióticos', 'antibiotico', 1, 0, 5.8, 3, 8, 4, [['AMS19', 45, 3], ['AMS30', 380, 5]], 'B1'],
  ['azit', 'Azitromicina 500 mg', 'Azitromicina', '500 mg', 'Tableta recubierta', 'Pfizer', 'Antibióticos', 'antibiotico', 3, 0, 8.9, 4.6, 10, 4, null, 'B2'],
  ['cipro', 'Ciprofloxacina 500 mg', 'Ciprofloxacina', '500 mg', 'Tableta', 'Calox', 'Antibióticos', 'antibiotico', 10, 10, 5.2, 2.6, 2, 4, null, 'B2'],
  ['lora', 'Loratadina 10 mg', 'Loratadina', '10 mg', 'Tableta', 'Genven', 'Antialérgicos', 'libre', 10, 10, 2.2, 1, 30, 8, null, 'C1'],
  ['ceti', 'Cetirizina 10 mg', 'Cetirizina', '10 mg', 'Tableta', 'Leti', 'Antialérgicos', 'libre', 10, 10, 2.6, 1.2, 14, 6, null, 'C1'],
  ['antig', 'Antigripal día y noche', 'Acetaminofén + Fenilefrina + Clorfenamina', '', 'Tableta', 'Calox', 'Antigripales y respiratorios', 'libre', 12, 6, 3.9, 1.9, 22, 8, [['AG2311', 60, 6], ['AG2405', 500, 16]], 'C2'],
  ['salbu', 'Salbutamol inhalador 100 mcg', 'Salbutamol', '100 mcg', 'Inhalador', 'GSK', 'Antigripales y respiratorios', 'receta', 1, 0, 7.5, 4, 7, 3, null, 'C2'],
  ['ambro', 'Ambroxol jarabe 30 mg/5 ml', 'Ambroxol', '30 mg/5 ml', 'Jarabe', 'Elter', 'Antigripales y respiratorios', 'libre', 1, 0, 4.2, 2.1, 9, 4, null, 'C3'],
  ['omep', 'Omeprazol 20 mg', 'Omeprazol', '20 mg', 'Cápsula', 'Genven', 'Gastrointestinales', 'libre', 14, 7, 3.6, 1.6, 35, 10, null, 'D1'],
  ['loper', 'Loperamida 2 mg', 'Loperamida', '2 mg', 'Tableta', 'Leti', 'Gastrointestinales', 'libre', 6, 6, 2.4, 1.1, 12, 4, [['LP77', 18, 3], ['LP90', 410, 9]], 'D1'],
  ['sro', 'Suero oral sabor fresa 500 ml', 'Sales de rehidratación oral', '500 ml', 'Solución oral', 'Pediasol', 'Gastrointestinales', 'libre', 1, 0, 2.9, 1.4, 16, 6, null, 'D2'],
  ['losar', 'Losartán potásico 50 mg', 'Losartán', '50 mg', 'Tableta recubierta', 'Genven', 'Cardiovasculares', 'receta', 30, 10, 5.4, 2.5, 24, 10, null, 'E1'],
  ['amlo', 'Amlodipino 5 mg', 'Amlodipino', '5 mg', 'Tableta', 'Calox', 'Cardiovasculares', 'receta', 30, 10, 4.8, 2.2, 12, 6, null, 'E1'],
  ['atorva', 'Atorvastatina 20 mg', 'Atorvastatina', '20 mg', 'Tableta recubierta', 'Leti', 'Cardiovasculares', 'receta', 30, 10, 7.2, 3.5, 9, 4, null, 'E2'],
  ['metf', 'Metformina 850 mg', 'Metformina', '850 mg', 'Tableta', 'Genven', 'Diabetes', 'receta', 30, 10, 4.1, 1.9, 26, 10, null, 'E3'],
  ['glibe', 'Glibenclamida 5 mg', 'Glibenclamida', '5 mg', 'Tableta', 'Calox', 'Diabetes', 'receta', 30, 10, 3.3, 1.5, 1, 4, null, 'E3'],
  ['levo', 'Levotiroxina 100 mcg', 'Levotiroxina', '100 mcg', 'Tableta', 'Merck', 'Otros', 'receta', 30, 10, 6.1, 3, 8, 4, null, 'E4'],
  ['alpra', 'Alprazolam 0,5 mg', 'Alprazolam', '0,5 mg', 'Tableta', 'Pfizer', 'Sistema nervioso', 'controlado', 30, 10, 9.5, 4.8, 6, 3, null, 'Gaveta'],
  ['clona', 'Clonazepam 2 mg', 'Clonazepam', '2 mg', 'Tableta', 'Roche', 'Sistema nervioso', 'controlado', 30, 10, 11.2, 5.6, 4, 3, null, 'Gaveta'],
  ['vitc', 'Vitamina C 1 g efervescente', 'Ácido ascórbico', '1 g', 'Comprimido efervescente', 'Redoxon', 'Vitaminas y suplementos', 'libre', 10, 0, 4.4, 2, 20, 6, null, 'F1'],
  ['compb', 'Complejo B', 'Complejo B', '', 'Tableta', 'Genven', 'Vitaminas y suplementos', 'libre', 30, 10, 3.8, 1.7, 15, 5, null, 'F1'],
  ['clotri', 'Clotrimazol crema 1%', 'Clotrimazol', '1%', 'Crema', 'Elter', 'Dermatológicos', 'libre', 1, 0, 3.5, 1.6, 7, 3, [['CL55', 80, 2], ['CL60', 600, 5]], 'F2'],
  ['solar', 'Protector solar FPS 50', '', 'FPS 50', 'Crema', 'Eucerin', 'Dermatológicos', 'libre', 1, 0, 18, 11, 5, 2, null, 'Vitrina'],
  ['panal', 'Pañales etapa 3 (paquete x30)', '', '', 'Otro', 'Huggies', 'Bebé y maternidad', 'libre', 1, 0, 12.5, 8.4, 10, 4, null, 'G1'],
  ['alcohol', 'Alcohol isopropílico 70% 1 L', 'Alcohol isopropílico', '70%', 'Otro', 'Farmacol', 'Material médico', 'libre', 1, 0, 3.2, 1.6, 14, 5, null, 'G2'],
  ['gasas', 'Gasas estériles 10x10 (sobre x10)', '', '', 'Otro', 'Medical', 'Material médico', 'libre', 1, 0, 1.8, 0.8, 25, 8, null, 'G2'],
  ['jeringa', 'Jeringa 5 ml', '', '5 ml', 'Otro', 'BD', 'Material médico', 'libre', 1, 0, 0.4, 0.15, 80, 30, null, 'G2']
];
const SERVICES = [['svc_tension', 'Toma de tensión arterial', 1], ['svc_glucosa', 'Prueba de glucosa', 2], ['svc_inyec', 'Inyectología (aplicación)', 2]];
const COLORS = ['#0d9488', '#0ea5e9', '#16a34a', '#7c3aed', '#dc2626', '#ca8a04', '#db2777', '#2563eb'];
const SUPPLIERS = [
  ['sup1', 'Droguería Nacional', 'J-30123456-7', 'Ana Morales', '0212-5553300', 15],
  ['sup2', 'Distribuidora Médica del Centro', 'J-40987654-3', 'Rubén Sosa', '0241-5554411', 30],
  ['sup3', 'Laboratorios Unidos (venta directa)', 'J-29876543-1', 'Lorena Paz', '0212-5559900', 7]
];
const DOCTORS = [['Dr. Pedro Ramírez', 'MPPS 45.211'], ['Dra. Ana Torres', 'MPPS 52.874'], ['Dr. Carlos Méndez', 'MPPS 38.090'], ['Dra. Laura Quintero', 'MPPS 61.302']];
/** k, nombre, teléfono, cédula, sexo, edad, alergias, condiciones, convenio, tratamientos [[producto, und/día, próxima compra en días, médico]], última compra (días atrás), saldo, extras */
const CLIENTS = [
  ['maria', 'María Elena Gómez', '0414-1112233', 'V-6123456', 'F', 62, [], ['Hipertensión', 'Colesterol alto'], 'a_seguro', [['losar', 1, 1, 0], ['atorva', 1, 12, 0]], 3, 0, {}],
  ['jose', 'José Luis Martínez', '0424-2223344', 'V-7234567', 'M', 58, ['Penicilina'], ['Diabetes'], null, [['metf', 2, -2, 1], ['glibe', 1, 4, 1]], 16, 12.5, {}],
  ['carmen', 'Carmen Rodríguez', '0412-3334455', 'V-4345678', 'F', 71, ['AINES (ibuprofeno, aspirina)'], ['Hipertensión', 'Artritis'], 'a_jubilados', [['amlo', 1, 0, 0]], 29, 0, { birthday: 0 }],
  ['luis', 'Luis Alberto Pérez', '0416-4445566', 'V-12456789', 'M', 45, [], ['Depresión / ansiedad'], null, [['alpra', 1, 6, 2]], 24, 0, {}],
  ['ana', 'Ana Karina Silva', '0414-5556677', 'V-20567890', 'F', 34, [], ['Embarazo'], null, [], 8, 0, { birthday: 3 }],
  ['pedro', 'Pedro Castillo', '0424-6667788', 'V-5678901', 'M', 66, [], ['Hipotiroidismo'], 'a_seguro', [['levo', 1, 2, 1]], 28, 0, {}],
  ['rosa', 'Rosa Elena Díaz', '0412-7778899', 'V-8789012', 'F', 54, ['Sulfas'], ['Diabetes', 'Hipertensión'], 'a_jubilados', [['metf', 2, 9, 1], ['losar', 1, 9, 0]], 21, 8, {}],
  ['miguel', 'Miguel Ángel Rojas', '0416-8889900', 'V-24890123', 'M', 29, [], ['Asma'], null, [['salbu', 0, 15, 3]], 30, 0, {}],
  ['yolanda', 'Yolanda Herrera', '0414-9990011', 'V-10901234', 'F', 49, ['Penicilina', 'Látex'], [], null, [], 40, 0, {}],
  ['jorge', 'Jorge Medina', '0424-1013141', 'V-17012345', 'M', 38, [], [], 'a_empresa', [], 11, 0, {}],
  ['sofia', 'Sofía Mendoza', '0412-1415161', '', 'F', 6, [], [], null, [], 5, 0, { notes: 'Niña · representante: Laura Mendoza' }],
  ['ramon', 'Ramón Gutiérrez', '0416-1617181', 'V-3123987', 'M', 77, [], ['Hipertensión', 'Insuficiencia renal'], 'a_jubilados', [['amlo', 1, -1, 0]], 31, 15, {}],
  ['gabriela', 'Gabriela Paredes', '0414-1819202', 'V-26234098', 'F', 27, [], [], null, [], 150, 0, {}],
  ['andres', 'Andrés Villalobos', '0424-2021222', 'V-11345109', 'M', 52, [], ['Colesterol alto'], 'a_seguro', [['atorva', 1, 20, 0]], 10, 0, {}],
  ['lucia', 'Lucía Fernández', '0412-2223242', 'V-14456210', 'F', 44, [], ['Gastritis'], null, [['omep', 1, 3, 3]], 11, 0, {}],
  ['hector', 'Héctor Salazar', '0416-2425262', 'V-9567321', 'M', 60, [], ['Epilepsia'], null, [['clona', 1, 14, 2]], 16, 0, {}]
];
const WALKIN_NAMES = ['Patricia Morales', 'Ricardo Fuentes', 'Elena Suárez', 'Fernando Ruiz', 'Marisol Peña', 'Alexis Romero'];

/** Farmacia de ejemplo: inventario con lotes y vencimientos, pacientes con tratamientos, recetas, convenios, compras, pedidos en línea y caja del día. */
export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const R = rng(11);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const methods = Object.keys(PAY_METHODS).filter((k) => k !== 'credito').slice(0, 6);
  const mk = () => Number(store.settings.fractionMarkup) || 0;

  // 1) Proveedores
  let b = store.batch();
  SUPPLIERS.forEach(([id, name, rif, contact, phone, days]) => b.set(store.ref('suppliers', 'demo_' + id), { name, rif, contact, phone, email: '', days, notes: '', active: true, createdAt: nowISO(), updatedAt: nowISO() }));

  // 2) Productos con lotes y vencimientos (algunos por vencer, uno vencido y algunos bajo el mínimo)
  const P = {};
  PRODUCTS.forEach(([k, name, active, strength, form, lab, category, rx, units, blister, price, cost, boxes, minBoxes, lotSpec, location], i) => {
    const spec = lotSpec || [[`${k.slice(0, 2).toUpperCase()}${2400 + i * 7}`, 300 + (i * 37) % 420, boxes]];
    let lots = [];
    for (const [lot, exp, bx] of spec) lots = addLot(lots, { lot, exp: inDays(exp), qty: bx * units, cost: money(cost) });
    const p = {
      name, active, strength, form, lab, category, rx, location, unitsPerBox: units, blister, fraction: units > 1, price: money(price), blisterPrice: 0, unitPrice: 0, cost: money(cost), lastCost: money(cost),
      minStock: minBoxes * units, maxStock: minBoxes * units * 3, trackStock: true, sellable: true, online: true, supplierId: 'demo_' + SUPPLIERS[i % 3][0], taxed: false, color: COLORS[i % COLORS.length],
      barcode: `759${String(1000000000 + i * 7919331).slice(0, 10)}`, sku: `${category.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`, notes: '',
      stock: boxes * units, lots, expiresAt: nextExpiry({ lots }) || '', sold: 0, createdAt: at(60, 9).toISOString(), updatedAt: nowISO(), by: 'demo'
    };
    P[k] = { id: 'demo_' + k, ...p };
  });
  SERVICES.forEach(([id, name, price]) => {
    P[id] = { id: 'demo_' + id, name, active: '', strength: '', form: 'Otro', lab: '', category: 'Servicios farmacéuticos', rx: 'libre', location: '', unitsPerBox: 1, blister: 0, fraction: false, price: money(price), cost: 0, minStock: 0, maxStock: 0, trackStock: false, sellable: true, online: false, supplierId: null, taxed: false, color: '#0d9488', barcode: '', sku: id.toUpperCase(), notes: '', stock: 0, lots: [], expiresAt: '', sold: 0, createdAt: at(60, 9).toISOString(), updatedAt: nowISO(), by: 'demo' };
  });

  // 3) Pacientes
  const clients = {};
  CLIENTS.forEach(([k, name, phone, idDoc, sex, age, allergies, conditions, agreementId, tr, last, debt, x], idx) => {
    const treatments = tr.map(([pk, daily, next, doc], j) => {
      const p = P[pk];
      const everyDays = daily > 0 ? Math.max(1, Math.floor(upb(p) / daily)) : 45;
      return { id: `t${idx}${j}`, productId: p.id, name: p.name, dailyUnits: daily, everyDays, lastAt: inDays(next - everyDays), nextAt: inDays(next), doctor: DOCTORS[doc][0], note: '', active: true, notifiedAt: null };
    });
    clients[k] = {
      id: 'demo_' + k, name, phone, email: '', idDoc, sex, birthDate: x.birthday != null ? birthdayIn(age, x.birthday) : birth(age, idx % 11 + 1, (idx * 5) % 27 + 1),
      address: idx % 3 === 0 ? 'Urb. Santa Rosa, calle ' + (idx + 2) : '', notes: x.notes || '', allergies, conditions, agreementId: agreementId || '', agreementNumber: agreementId ? `AF-${10200 + idx * 13}` : '',
      doctor: treatments[0]?.doctor || '', tags: [], cardCode: genCode(8), active: true, visits: 0, totalSpent: 0, balance: debt ? money(debt) : 0, points: 0, treatments,
      lastVisitAt: null, createdAt: at(Math.max(60, last + 20), 10).toISOString(), updatedAt: nowISO(), by: 'demo', _last: last
    };
  });
  Object.values(clients).sort((a, b2) => a.createdAt.localeCompare(b2.createdAt)).forEach((c) => { const seq = store.nextSeq(b, 'cli'); c.number = fmtSeq('P', seq, 4); c.seq = seq; });

  // 4) Historial de 45 días: ventas, recetas y convenios
  const line = (p, pack, qty) => {
    const f = packFactor(p, pack);
    return { productId: p.id, name: p.name, pack, factor: f, qty, price: packPrice(p, pack, mk()), listPrice: packPrice(p, pack, mk()), cost: round2(unitCost(p) * f * 10000) / 10000, kind: p.trackStock === false ? 'servicio' : 'producto', rx: p.rx || 'libre', detail: '' };
  };
  const counter = { libre: [], rx: [] };
  for (const k of Object.keys(P)) (P[k].rx === 'libre' && P[k].trackStock !== false ? counter.libre : P[k].rx !== 'libre' ? counter.rx : []).push(P[k]);
  const hist = [];
  // Compras de los pacientes (su tratamiento cada ciclo)
  for (const c of Object.values(clients)) {
    const meds = c.treatments.map((t) => P[Object.keys(P).find((k) => P[k].id === t.productId)]);
    const cycle = c.treatments[0]?.everyDays || 25;
    for (let d = c._last; d <= 45; d += cycle) {
      const lines = meds.length ? meds.map((p) => line(p, 'caja', 1)) : [line(pick(counter.libre), 'caja', 1)];
      if (R() < 0.35) lines.push(line(pick(counter.libre), 'caja', 1));
      if (R() < 0.2) lines.push(line(P.svc_tension, 'caja', 1));
      hist.push({ date: at(d, 8 + Math.floor(R() * 12), Math.floor(R() * 4) * 15), lines, client: c });
    }
  }
  // Ventas de mostrador sin registrar
  for (let d = 45; d >= 1; d--) {
    const n = 5 + Math.floor(R() * 7) + (d % 7 === 1 ? 3 : 0);
    for (let j = 0; j < n; j++) {
      const lines = [];
      const items = 1 + Math.floor(R() * 3);
      for (let q = 0; q < items; q++) {
        const p = R() < 0.12 ? pick(counter.rx) : pick(counter.libre);
        if (lines.some((l) => l.productId === p.id)) continue;
        const pack = upb(p) > 1 && R() < 0.4 ? (hasBlister(p) && R() < 0.6 ? 'blister' : 'unidad') : 'caja';
        lines.push(line(p, pack, pack === 'unidad' ? 2 + Math.floor(R() * 5) : 1 + Math.floor(R() * 2)));
      }
      hist.push({ date: at(d, 7 + Math.floor(R() * 14), Math.floor(R() * 60)), lines, client: null });
    }
  }
  hist.sort((a, c) => a.date - c.date);
  const docs = [];
  for (const h of hist) {
    const c = h.client;
    const ag = c?.agreementId ? AGREEMENTS.find((a) => a.id === c.agreementId) : null;
    const t = cartTotals(h.lines, 0);
    const agc = agreementCalc(ag, h.lines);
    const total = round2(t.subtotal - agc.discount);
    const covered = round2(Math.min(total, agc.covered));
    const paid = round2(total - covered);
    const method = pick(methods);
    const seq = store.nextSeq(b, 'inv');
    const number = fmtSeq(store.settings.invoicePrefix || 'F', seq, 6);
    const saleId = 'demo_s' + seq;
    const items = h.lines.map((l) => ({ ...l, total: round2(l.price * l.qty) }));
    const daysAgo = Math.round((Date.now() - h.date.getTime()) / 864e5);
    const seller = SELLERS[Math.floor(R() * SELLERS.length)];
    const sale = {
      number, seq, kind: 'venta', date: h.date.toISOString(), dayKey: dayKey(h.date), items, subtotal: t.subtotal, discount: agc.discount, total,
      cost: round2(items.reduce((a, i) => a + i.cost * i.qty, 0)), rate: 1,
      payments: paid > 0 ? [{ method, currency: 'USD', amount: paid, usd: paid }] : [], paidUSD: paid, changeUSD: 0, changeCurrency: 'USD', method: paid > 0 ? method : 'convenio', received: paid, shiftId: null, cashFlow: null,
      ...(c ? clientFields({ ...c }) : clientFields(null)), status: 'completed', by: 'demo', note: '', credit: 0,
      agreementId: ag?.id || null, agreementName: ag?.name || '', agreementDue: covered, agreementPaid: covered > 0 ? daysAgo > 20 : null, agreementDiscount: agc.discount,
      pointsUsed: 0, pointsDiscount: 0, manualDiscount: 0, sellerId: seller.id, sellerName: seller.name, orderId: null, pointsEarned: c ? Math.floor(paid) : 0
    };
    const rxItems = items.filter((l) => l.rx !== 'libre');
    if (rxItems.length) {
      const rseq = store.nextSeq(b, 'rx');
      const tdoc = c?.treatments.find((tr) => rxItems.some((l) => l.productId === tr.productId));
      const [doctor, license] = tdoc ? DOCTORS.find((d) => d[0] === tdoc.doctor) : pick(DOCTORS);
      const patient = c?.name || pick(WALKIN_NAMES);
      const rxId = 'demo_rx' + rseq;
      sale.rxId = rxId;
      docs.push(['prescriptions', rxId, {
        number: fmtSeq('RX', rseq, 5), seq: rseq, date: sale.date, dayKey: sale.dayKey, saleId, saleNumber: number, doctor, license, rxNumber: String(1000 + rseq * 17), rxDate: sale.dayKey,
        patient, patientId: c?.idDoc || `V-${15000000 + rseq * 3711}`, clientId: c?.id || null, retained: rxItems.some((l) => l.rx !== 'receta'), controlled: rxItems.some((l) => l.rx === 'controlado'), note: '',
        items: rxItems.map((l) => ({ productId: l.productId, name: l.name, rx: l.rx, qty: l.qty, pack: l.pack, units: l.qty * l.factor, lots: Object.values(P).find((p) => p.id === l.productId)?.lots?.[0]?.lot || '', active: Object.values(P).find((p) => p.id === l.productId)?.active || '' })),
        status: 'dispensada', by: 'demo'
      }]);
    }
    docs.push(['sales', saleId, sale]);
    for (const l of items) { const p = Object.values(P).find((x) => x.id === l.productId); if (p && p.trackStock !== false) p.sold += l.qty * l.factor; }
    if (c) { c.visits++; c.totalSpent = round2(c.totalSpent + paid); c.points += Math.floor(paid); c.lastVisitAt = sale.date; }
  }

  for (const c of Object.values(clients)) if (!c.lastVisitAt && c._last > 45) { c.lastVisitAt = at(c._last, 11).toISOString(); c.visits = 2; c.totalSpent = money(14); c.points = 14; }

  // 5) Mediciones del servicio farmacéutico
  const MEAS = [['maria', 'tension', 145, 92, 3], ['maria', 'tension', 138, 88, 17], ['jose', 'glucosa', 132, null, 16], ['jose', 'glucosa', 118, null, 31], ['carmen', 'tension', 128, 82, 29], ['ramon', 'tension', 150, 95, 31], ['rosa', 'glucosa', 104, null, 21], ['andres', 'colesterol', 228, null, 10], ['ana', 'peso', 68.5, null, 8], ['sofia', 'temperatura', 38.4, null, 5]];
  MEAS.forEach(([k, type, value, value2, d], i) => {
    const c = clients[k]; const date = at(d, 10, i * 5).toISOString();
    docs.push(['measures', 'demo_m' + i, { clientId: c.id, clientName: c.name, type, value, value2, note: '', date, dayKey: date.slice(0, 10), by: 'demo' }]);
    if (!c.lastMeasure || c.lastMeasure.date < date) c.lastMeasure = { type, value, value2, date };
  });

  // 6) Mermas y lotes vencidos retirados (para el reporte de pérdidas)
  docs.push(['inventory_logs', 'demo_l1', { productId: P.antig.id, name: P.antig.name, date: at(9, 18).toISOString(), dayKey: dayKey(at(9, 18)), type: 'vencido', qty: -24, cost: unitCost(P.antig), lots: [{ lot: 'AG2207', exp: inDays(-10), qty: 24 }], reason: 'Lote vencido retirado del anaquel', by: 'demo' }]);
  docs.push(['inventory_logs', 'demo_l2', { productId: P.sro.id, name: P.sro.name, date: at(4, 12).toISOString(), dayKey: dayKey(at(4, 12)), type: 'merma', qty: -2, cost: unitCost(P.sro), lots: [], reason: 'Envases rotos al descargar', by: 'demo' }]);

  // Guardar todo
  for (const p of Object.values(P)) { const { id, ...data } = p; docs.push(['products', id, data]); }
  for (const c of Object.values(clients)) { const { id, _last, ...data } = c; docs.push(['clients', id, data]); }
  await store.commit(b);
  for (let i = 0; i < docs.length; i += 400) {
    const bb = store.batch();
    docs.slice(i, i + 400).forEach(([col, id, data]) => bb.set(store.ref(col, id), data));
    await store.commit(bb);
  }
  b = store.batch();
  for (const c of Object.values(clients)) { const { _last, ...data } = c; b.set(store.cardRef(c.cardCode), cardData(data)); }
  await store.commit(b);
  await waitFor(() => store.products.length >= PRODUCTS.length && store.clients.length >= CLIENTS.length && store.suppliers.length >= SUPPLIERS.length);

  // 7) Caja abierta y ventas de hoy en vivo (receta, convenio, controlado, fraccionado)
  try {
    if (!store.openShift) { await openShift({ openingUSD: money(50), note: 'Apertura demo' }); await waitFor(() => store.openShift); }
    const pr = (k) => store.product('demo_' + k);
    const cl = (k) => store.client('demo_' + k);
    const L = (k, pack = 'caja', qty = 1) => line(pr(k), pack, qty);
    const due = (lines, agId = null) => { const ag = agId ? store.agreement(agId) : null; const t = cartTotals(lines, 0); const a = agreementCalc(ag, lines); const total = round2(t.subtotal - a.discount); return round2(total - Math.min(total, a.covered)); };
    const sell = async (lines, opts = {}, method = 'efectivo') => {
      const amount = due(lines, opts.agreementId);
      await chargeSale({ lines, payments: amount > 0 ? [{ method, amount }] : [], sellerId: 's1', ...opts });
    };
    const maria = cl('maria');
    await sell([L('losar'), L('svc_tension')], { client: maria, agreementId: 'a_seguro', rx: { doctor: DOCTORS[0][0], license: DOCTORS[0][1], patient: maria?.name, patientId: maria?.idDoc, number: '4471', date: todayKey() } }, 'debito');
    await sell([L('acet', 'blister', 2), L('vitc')], { sellerId: 's3' }, 'efectivo');
    const luis = cl('luis');
    await sell([L('alpra')], { client: luis, rx: { doctor: DOCTORS[2][0], license: DOCTORS[2][1], patient: luis?.name, patientId: luis?.idDoc, number: '9902', date: todayKey(), retained: true } }, 'transferencia');
    const yol = cl('yolanda');
    await sell([L('azit'), L('lora')], { client: yol, rx: { doctor: DOCTORS[3][0], license: DOCTORS[3][1], patient: yol?.name, patientId: yol?.idDoc, number: '3318', date: todayKey(), retained: true }, sellerId: 's2' }, methods[3] || 'efectivo');
    await sell([L('ibu', 'unidad', 4), L('sro', 'caja', 2)], { sellerId: 's3' }, 'efectivo');
    const jorge = cl('jorge');
    await sell([L('omep'), L('compb')], { client: jorge, agreementId: 'a_empresa' }, 'debito');
    await cashMovement({ direction: 'out', currency: 'USD', amount: money(4), concept: 'Bolsas y papel térmico', category: 'Insumos (bolsas, papel, etiquetas)' });
    await cashMovement({ direction: 'out', currency: 'USD', amount: money(3), concept: 'Pago al motorizado', category: 'Delivery / motorizado' });
  } catch (e) { console.warn('[demo] ventas de hoy', e); }

  // 8) Compras: dos facturas por pagar (una vencida) y una orden pendiente
  try {
    const pr = (k) => store.product('demo_' + k);
    await receivePurchase({ supplierId: 'demo_sup1', invoiceNo: 'FAC-88231', items: [{ productId: pr('cipro').id, boxes: 10, cost: pr('cipro').cost, lot: 'CP2611', exp: inDays(540) }, { productId: pr('diclo').id, boxes: 8, cost: pr('diclo').cost, lot: 'DC2610', exp: inDays(480) }], paid: 0, dueDate: inDays(5), note: 'Crédito a 15 días' });
    await receivePurchase({ supplierId: 'demo_sup2', invoiceNo: 'B-004512', items: [{ productId: pr('omep').id, boxes: 12, cost: pr('omep').cost, lot: 'OM2609', exp: inDays(610) }, { productId: pr('ambro').id, boxes: 6, cost: pr('ambro').cost, lot: 'AB2608', exp: inDays(400) }], paid: money(10), dueDate: inDays(-2) });
    await createPurchaseOrder({ supplierId: 'demo_sup3', items: [{ productId: pr('glibe').id, boxes: 10, cost: pr('glibe').cost }, { productId: pr('salbu').id, boxes: 4, cost: pr('salbu').cost }], note: 'Pedido por WhatsApp' });
  } catch (e) { console.warn('[demo] compras', e); }

  // 9) Pedidos en línea (catálogo público)
  try {
    const slug = store.settings.shop?.slug || '';
    await store.saveSettings({ shop: { ...store.settings.shop, deliveryFee: money(1.5) } });
    const it = (k, q) => { const p = store.product('demo_' + k); return { id: p.id, n: p.name, q, p: p.price, rx: p.rx !== 'libre' }; };
    const mkOrder = (name, phone, mode, items, note, minsAgo) => {
      const fee = mode === 'delivery' ? money(1.5) : 0;
      return { tenantId: store.tenantId, slug, number: 'W-' + genCode(5), name, phone, address: mode === 'delivery' ? 'Res. Los Samanes, torre B, apto 4-2' : '', mode, deliveryFee: fee, note, payMethod: mode === 'delivery' ? 'Efectivo al recibir' : 'Pago móvil', hasRx: items.some((x) => x.rx), items, total: round2(items.reduce((a, x) => a + x.p * x.q, 0) + fee), status: 'nueva', createdAt: new Date(Date.now() - minsAgo * 60000).toISOString() };
    };
    const ob = store.batch();
    const r1 = doc(collection(db, 'orders')); const r2 = doc(collection(db, 'orders')); const r3 = doc(collection(db, 'orders'));
    ob.set(r1, mkOrder('Patricia Morales', '0414-7654321', 'delivery', [it('antig', 1), it('vitc', 2), it('sro', 2)], 'Tocar el timbre 2 veces', 8));
    ob.set(r2, mkOrder('Ricardo Fuentes', '0412-9876543', 'retiro', [it('losar', 2)], 'Llevo la receta en físico', 35));
    ob.set(r3, mkOrder('Elena Suárez', '0424-1237890', 'retiro', [it('ibu', 1), it('lora', 1), it('gasas', 3)], '', 70));
    await store.commit(ob);
    await waitFor(() => store.orders.length >= 3, 4000);
    await setOrderStatus({ id: r2.id }, 'preparando');
    await setOrderStatus({ id: r3.id }, 'lista');
  } catch (e) { console.warn('[demo] pedidos', e); }
}

/** Borra todos los datos de una sede (sus tarjetas públicas, su catálogo en línea y sus pedidos). */
export async function purgeTenant(tenantId, onlyDemo = true, slug = '') {
  try {
    const snap = await getDocs(collection(db, 'tenants', tenantId, 'clients'));
    const codes = snap.docs.map((d) => d.data().cardCode).filter(Boolean);
    for (let i = 0; i < codes.length; i += 400) {
      const b = writeBatch(db);
      codes.slice(i, i + 400).forEach((c) => b.delete(doc(db, 'cards', c)));
      await b.commit().catch((e) => console.warn('[purge] tarjetas', e?.code || e));
    }
  } catch (e) { console.warn('[purge] tarjetas', e?.code || e); }
  try {
    let s = slug;
    if (!s) { const st = await getDoc(doc(db, 'tenants', tenantId, 'config', 'settings')); s = st.exists() ? st.data().shop?.slug || '' : ''; }
    if (s) { const sh = await getDoc(doc(db, 'shops', s)); if (sh.exists() && sh.data().tenantId === tenantId) { const b = writeBatch(db); b.delete(sh.ref); await b.commit(); } }
  } catch (e) { console.warn('[purge] catálogo', e?.code || e); }
  try {
    const rq = await getDocs(query(collection(db, 'orders'), where('tenantId', '==', tenantId)));
    for (let i = 0; i < rq.docs.length; i += 400) { const b = writeBatch(db); rq.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
  } catch (e) { console.warn('[purge] pedidos', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId, slug = '') {
  await purgeTenant(tenantId, true, slug);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
