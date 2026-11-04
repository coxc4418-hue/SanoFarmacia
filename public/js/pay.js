// SanoFarmacia — Ventana de cobro reutilizable (pagos mixtos, abonos y vuelto) en la moneda del país
import { store } from './store.js';
import { openModal, toast, num, esc, parseNum, setBusy, usd, bs, PAY_METHODS, round2, loc, flagImg } from './utils.js';
import { icon } from './icons.js';

const prefPrint = () => { try { return localStorage.getItem('sf_print') !== '0'; } catch (_) { return true; } };
const setPrefPrint = (v) => { try { localStorage.setItem('sf_print', v ? '1' : '0'); } catch (_) {} };

/**
 * Abre el cobro.
 * opts: { title, sub, amount, editable (monto modificable, p. ej. abono), max, discount (permite descuento), baseTotal, confirmText, onConfirm(result) }
 * result: { amount, discount, payments, changeCurrency, print }
 * onConfirm puede lanzar un error (se muestra en la ventana). Resuelve con lo que devuelva onConfirm, o null si se cancela.
 */
export function openPay(opts) {
  return new Promise((resolve) => {
    const L = loc(); const dec = L.dec; const nm = (v) => num(v, dec);
    if (!store.openShift) { toast('Abre la caja antes de cobrar (menú Caja).', 'warning', 4500); resolve(null); return; }
    const st = { amount: round2(opts.amount || 0), discount: round2(opts.discountValue || 0), pays: [], changeCurrency: 'USD' };
    const base = round2(opts.baseTotal ?? opts.amount ?? 0);
    let done = false;
    const m = openModal({
      title: opts.title || 'Cobrar', size: 'lg',
      sub: `${opts.sub ? opts.sub : ''}${opts.sub ? ' · ' : ''}${esc(L.curName)}`,
      body: `
        <div class="stack">
          <div class="pay-total"><div class="small muted">${opts.editable ? 'Monto a abonar' : 'Total a cobrar'}</div><b data-total>${usd(0)}</b></div>
          ${opts.editable || opts.discount ? `<div class="form-grid">
            ${opts.editable ? `<div class="field"><label>Monto del abono</label><div class="input-group"><span class="prefix">${esc(L.sym)}</span><input class="input" data-amount inputmode="decimal" value="${nm(st.amount)}"></div>${opts.max ? `<span class="hint">Saldo pendiente: ${usd(opts.max)}</span>` : ''}</div>` : ''}
            ${opts.discount ? `<div class="field"><label>Descuento</label><div class="input-group"><span class="prefix">${esc(L.sym)}</span><input class="input" data-disc inputmode="decimal" value="${st.discount ? nm(st.discount) : ''}" placeholder="0"></div></div>` : ''}
          </div>` : ''}
          <div data-breakdown class="small muted"></div>
          <div>
            <div class="section-title">Forma de pago</div>
            <div class="pay-methods mt">${Object.entries(PAY_METHODS).map(([k, p]) => `<button type="button" class="pay-method" data-m="${k}"><i style="background:${p.color}"></i>${p.label}</button>`).join('')}</div>
          </div>
          <div class="pay-lines" data-lines></div>
          <div class="pay-status due" data-status></div>
          <label class="check"><input type="checkbox" data-print ${prefPrint() ? 'checked' : ''}> <span>${esc(opts.printLabel || 'Imprimir comprobante')}</span></label>
          <div class="error-msg" data-err></div>
        </div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success btn-lg" data-ok>${icon('check')} Cobrar</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const $ = (q) => m.el.querySelector(q);
    const total = () => opts.discount ? round2(Math.max(0, base - st.discount)) : round2(st.amount);
    const paidUSD = () => round2(st.pays.reduce((a, p) => a + p.amount, 0));

    function addPay(method) {
      const rest = Math.max(0, round2(total() - paidUSD()));
      st.pays.push({ method, amount: rest });
      renderLines();
      const inputs = m.el.querySelectorAll('[data-amt]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }

    function renderLines() {
      $('[data-lines]').innerHTML = st.pays.map((p, i) => {
        const def = PAY_METHODS[p.method];
        return `<div class="pay-line">
          <span class="lbl"><i style="background:${def.color}"></i>${def.label}</span>
          <div class="input-group"><span class="prefix">${esc(L.sym)}</span><input class="input input-sm" style="padding-left:${12 + L.sym.length * 9}px" data-amt="${i}" inputmode="decimal" value="${nm(p.amount)}"></div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm="${i}" aria-label="Quitar">${icon('x')}</button>
        </div>`;
      }).join('');
      m.el.querySelectorAll('[data-amt]').forEach((inp) => {
        inp.oninput = () => {
          const p = st.pays[+inp.dataset.amt];
          p.amount = parseNum(inp.value);
          renderStatus();
        };
      });
      m.el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { st.pays.splice(+b.dataset.rm, 1); renderLines(); });
      m.el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', st.pays.some((p) => p.method === b.dataset.m)));
      renderStatus();
    }

    function renderStatus() {
      const t = total();
      $('[data-total]').innerHTML = `${usd(t)}${bs(t) ? `<small class="pay-fx">${bs(t)}</small>` : ''}`;
      $('[data-breakdown]').textContent = opts.breakdown ? opts.breakdown(st) : (opts.discount && st.discount ? `Total ${usd(base)} · Descuento −${usd(st.discount)}` : '');
      const diff = round2(paidUSD() - t);
      const stEl = $('[data-status]');
      if (t <= 0.004) { stEl.className = 'pay-status ok'; stEl.innerHTML = `<span>${icon('check')} Nada por cobrar</span><span></span>`; }
      else if (!st.pays.length) { stEl.className = 'pay-status due'; stEl.innerHTML = `<span>Elige una forma de pago</span><span>${usd(t)}</span>`; }
      else if (diff < -0.009) { stEl.className = 'pay-status due'; stEl.innerHTML = `<span>Falta</span><span class="num">${usd(-diff)}${bs(-diff) ? ` · ${bs(-diff)}` : ''}</span>`; }
      else { stEl.className = 'pay-status ok'; stEl.innerHTML = diff > 0.009 ? `<span>Vuelto</span><span class="num">${usd(diff)}${bs(diff) ? ` · ${bs(diff)}` : ''}</span>` : `<span>${icon('check')} Pago completo</span><span></span>`; }
      $('[data-ok]').innerHTML = `${icon('check')} ${esc(opts.confirmText || 'Cobrar')} ${t > 0.004 ? usd(t) : ''}`;
    }

    m.el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => addPay(b.dataset.m));
    if ($('[data-amount]')) $('[data-amount]').oninput = (e) => { st.amount = round2(parseNum(e.target.value)); renderStatus(); };
    if ($('[data-disc]')) $('[data-disc]').oninput = (e) => { st.discount = round2(Math.min(base, parseNum(e.target.value))); renderStatus(); };

    $('[data-ok]').onclick = async (e) => {
      const btn = e.currentTarget; const err = $('[data-err]');
      err.textContent = '';
      const t = total();
      if (opts.editable && !(t > 0)) { err.textContent = 'Indica el monto.'; return; }
      if (opts.max && t > opts.max + 0.009) { err.textContent = `El abono no puede ser mayor que el saldo (${usd(opts.max)}).`; return; }
      if (t > 0.004 && !st.pays.length) { err.textContent = 'Elige al menos una forma de pago.'; return; }
      if (t > 0.004 && paidUSD() < t - 0.009) { err.textContent = `Falta por cobrar ${usd(t - paidUSD())}.`; return; }
      setBusy(btn, true, 'Procesando…');
      try {
        const print = $('[data-print]').checked;
        setPrefPrint(print);
        const out = await opts.onConfirm({ amount: t, discount: st.discount, payments: st.pays, changeCurrency: st.changeCurrency, print });
        done = true;
        m.close();
        resolve(out ?? true);
      } catch (ex) {
        err.textContent = ex?.message || String(ex);
        setBusy(btn, false);
      }
    };
    renderLines();
    if (total() > 0) addPay('efectivo');
  });
}

/** Pantalla de confirmación tras cobrar */
export function showPaid(sale, { title = 'Cobro registrado', onPrint } = {}) {
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:18px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('check')}</div>
      <div><div class="muted small">${esc(title)}</div><div style="font-size:30px;font-weight:800;letter-spacing:-.02em">${esc(sale.number)}</div></div>
      <div><b style="font-size:20px">${usd(sale.received ?? sale.total)}</b></div>
      ${sale.changeUSD > 0.009 ? `<div class="badge badge-warning" style="height:28px;font-size:13px">Vuelto: ${usd(sale.changeUSD)}</div>` : ''}
    </div>`,
    footer: `${onPrint ? `<button class="btn btn-secondary" data-pr>${icon('print')} Imprimir</button>` : ''}<button class="btn btn-primary" data-close autofocus>Listo</button>`
  });
  if (onPrint) m.el.querySelector('[data-pr]').onclick = onPrint;
}
