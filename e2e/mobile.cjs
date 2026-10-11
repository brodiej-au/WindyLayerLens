// Checks the lens in Windy's mobile layout (phone-sized screen, touch), where it is docked
// in Windy's strip for small plugins instead of floating. Mounted by hand, as in desktop.cjs.
const { chromium } = require('playwright-core');
// Chromium to drive. Unset, Playwright looks for the build it was installed with.
const CHROME = process.env.CHROME_PATH;
const PLUGIN_URL = process.env.PLUGIN_URL || 'https://localhost:9999/plugin.js';
const OUT = __dirname + '/shots/mobile';
require('fs').mkdirSync(__dirname + '/shots', { recursive: true });

const results = [];
const check = (name, ok, detail) => {
    results.push(!!ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] });
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    await page.goto('https://www.windy.com/?-33.87,151.21,7', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.W && W.store && W.map && W.map.map && W.broadcast, null, { timeout: 60000 });
    await sleep(6000);
    const env = await page.evaluate(() => ({ device: W.rootScope.device || W.detectedDevice, isMobile: W.rootScope.isMobile, isMobileOrTablet: W.rootScope.isMobileOrTablet, slots: [...document.querySelectorAll('[data-plugin]')].map(e => e.getAttribute('data-plugin')), inner: [innerWidth, innerHeight] }));
    check('Windy is in its mobile layout', env.isMobile && env.slots.includes('bottom-below-controls-mobile'), { device: env.device, inner: env.inner });

    const mounted = await page.evaluate(async url => {
        const slot = document.querySelector('[data-plugin="bottom-below-controls-mobile"]');
        if (!slot) return 'no mobile slot';
        const node = document.createElement('div');
        node.id = 'plugin-windy-plugin-layer-lens';
        node.className = 'plugin-mobile-bottom-small dark-content';
        const x = document.createElement('div'); x.className = 'closing-x'; node.appendChild(x);
        slot.appendChild(node);
        setTimeout(() => node.classList.add('open'), 50);
        const mod = await import(url);
        window.__pipApp = new mod.default({ target: node, anchor: x, props: {} });
        window.__pipNode = node;
        return 'ok';
    }, PLUGIN_URL);
    check('plugin mounts in the small-plugin strip', mounted === 'ok', mounted);
    await page.waitForFunction(() => !document.querySelector('.pip__status') && !document.querySelector('.pip__layer').disabled, null, { timeout: 90000 });
    await sleep(5000);
    const rect = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, sel);
    const lens = { host: await rect('#plugin-windy-plugin-layer-lens'), pip: await rect('.pip'), view: await rect('.pip__view'), iframe: await rect('.pip iframe'), pointer: await rect('.pip__pointer'), grips: await page.evaluate(() => document.querySelectorAll('.pip__grip, .pip__knob').length) };
    check('lens is docked: fills the strip, no grips, no intro, second map over the whole main map', lens.pip.join() === lens.host.join() && lens.grips === 0 && !lens.pointer && lens.iframe.join() === [0, 0, ...env.inner].join(), lens);
    await page.screenshot({ path: OUT + '-lens.png' });

    await page.tap('.pip__layer');
    await sleep(800);
    await page.locator('.tile', { hasText: /^\s*Wind\s*$/ }).first().tap();
    await sleep(3000);
    const p = await page.evaluate(() => {
        const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
        const panel = document.querySelector('.pip__panel');
        return { panel: q('.pip__panel'), now: q('.picker__now'), search: q('.picker__search'), tabs: q('.picker__tabs'), grid: q('.picker__grid'), tilesVisible: [...document.querySelectorAll('.tile')].filter(t => { const r = t.getBoundingClientRect(), g = document.querySelector('.picker__grid').getBoundingClientRect(); return r.bottom <= g.bottom + 1; }).length, focused: document.activeElement && document.activeElement.className, onTop: panel.contains(document.elementFromPoint(195, panel.getBoundingClientRect().top + 30)), selects: panel.querySelectorAll('select').length, modelChips: panel.querySelectorAll('.picker__now .chip').length };
    });
    check('picker is compact: drop-downs instead of chips, groups on one line, keyboard not raised', p.selects === 2 && p.modelChips === 0 && p.tabs[3] <= 32 && !/picker__search/.test(p.focused || ''), p);
    check('picker sits right above the lens, on top of Windy\'s own UI, with room for layers', p.panel[1] + p.panel[3] === lens.host[1] - 8 && p.onTop && p.tilesVisible >= 8, p);
    await page.screenshot({ path: OUT + '-picker.png' });

    // options menu on mobile
    await page.tap('.pip__bar .pip__icon:nth-of-type(2)');
    await sleep(500);
    const menu = await page.evaluate(() => [...document.querySelectorAll('.menu__label')].map(e => e.textContent));
    check('menu offers View only: a docked lens has no shape to change', menu.join() === 'View', menu);
    await page.screenshot({ path: OUT + '-menu.png' });
    check('no page errors', errors.length === 0, errors.slice(0, 5));
    await browser.close();
    const failed = results.filter(r => !r).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('MOBILE FAILED', String(e && e.stack || e).slice(0, 1200)); process.exit(1); });
