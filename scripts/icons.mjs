// Genera los iconos PNG de la app y el logo con nombre a partir de public/assets/logo.svg
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'public', 'assets');
const svg = readFileSync(path.join(assets, 'logo.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const shot = async (file, size, { pad = 0, bg = 'transparent', radius = true } = {}) => {
  await page.setViewport({ width: size, height: size });
  const inner = size - pad * 2;
  const s = radius ? svg : svg.replaceAll('rx="120"', 'rx="0"');
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">${s.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: path.join(assets, file), omitBackground: bg === 'transparent' });
  console.log('✔', file);
};
await shot('icon-192.png', 192);
await shot('icon-512.png', 512);
await shot('favicon.png', 48);
await shot('apple-touch-icon.png', 180, { radius: false });
await shot('icon-maskable.png', 512, { radius: false });
await shot('icon-1024.png', 1024);

// Logo horizontal con nombre (claro y oscuro) para documentos, redes y el README
const brand = async (file, dark) => {
  await page.setViewport({ width: 1600, height: 560 });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;800&display=swap" rel="stylesheet"></head>
  <body style="margin:0;width:1600px;height:560px;display:flex;align-items:center;justify-content:center;gap:56px;background:${dark ? '#04120e' : 'transparent'};font-family:'Plus Jakarta Sans',sans-serif">
    ${svg.replace('<svg ', '<svg width="360" height="360" ')}
    <div><div style="font-size:150px;font-weight:800;letter-spacing:-5px;line-height:1;color:${dark ? '#ffffff' : '#0b1d19'}">Sano<span style="background:linear-gradient(90deg,#6ee7b7,#10b981 60%,#047857);-webkit-background-clip:text;color:transparent">Farmacia</span></div>
    <div style="font-size:44px;font-weight:500;color:${dark ? '#9fb8b1' : '#4f6560'};margin-top:18px;letter-spacing:.5px">Gestión profesional para farmacias</div></div>
  </body></html>`, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
  await page.screenshot({ path: path.join(here, '..', file), omitBackground: !dark });
  console.log('✔', file);
};
await brand('LOGO_SANO_FARMACIA.png', false);
await brand('LOGO_SANO_FARMACIA_OSCURO.png', true);
await browser.close();
