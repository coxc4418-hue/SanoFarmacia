// Verifica que la app sea instalable (PWA) y que el botón Instalar funcione
import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'https://sano-farmacia.web.app';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: process.env.CLAUDE_JOB_DIR + '/tmp/pwa-profile' });
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? '  ✔' : '  ✘', n, x); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [label, vp, ua] of [['PC', { width: 1366, height: 860 }, null], ['Android', { width: 390, height: 844, isMobile: true, hasTouch: true }, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36']]) {
  console.log(label);
  const p = await b.newPage();
  if (ua) await p.setUserAgent(ua);
  await p.setViewport(vp);
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await sleep(2500);
  const cdp = await p.createCDPSession();
  const errs = await cdp.send('Page.getInstallabilityErrors');
  ok('Instalable según Chrome', errs.installabilityErrors.length === 0, JSON.stringify(errs.installabilityErrors));
  const man = await cdp.send('Page.getAppManifest');
  ok('Manifiesto sin errores', !man.errors?.length, JSON.stringify(man.errors || []));
  ok('Service worker activo', await p.evaluate(async () => !!(await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))]))?.active));
  const native = await p.evaluate(async () => (await import('/js/install.js')).canPrompt());
  ok('Chrome ofrece el instalador nativo', native);
  ok('Tarjeta "Instala la app" en el login', !!(await p.$('.install-card [data-install]')));
  // Sin instalador nativo (p. ej. iPhone o ya rechazado) se muestran los pasos
  await p.evaluate(async () => { const m = await import('/js/install.js'); window.__steps = true; });
  await p.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await p.click('.install-card [data-install]');
  await p.waitForSelector('.modal', { timeout: 5000 });
  const txt = await p.$eval('.modal', (m) => m.innerText);
  ok('Pasos de instalación como respaldo', label === 'PC' ? /barra de direcciones/.test(txt) : /Instalar app/.test(txt));
  await p.screenshot({ path: `${process.env.CLAUDE_JOB_DIR}/tmp/pwa-${label}.png` });
  await p.close();
}
await b.close();
console.log(fails ? `FALLAS: ${fails}` : 'PWA OK');
process.exit(fails ? 1 : 0);
