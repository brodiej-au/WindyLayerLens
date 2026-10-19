// End-to-end check of the Layer Lens plugin inside a real (headless) Windy.
// Windy's own loader needs a logged-in account, so the plugin is mounted the same way
// Windy mounts an embedded external plugin: same slot, same id and classes, same constructor args.
const { chromium } = require('playwright-core');

// Chromium to drive. Unset, Playwright looks for the build it was installed with.
const CHROME = process.env.CHROME_PATH;
const PLUGIN_URL = process.env.PLUGIN_URL || 'https://localhost:9999/plugin.js';
const SHOT = __dirname + '/shots/desktop';
require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
const NAME = 'windy-plugin-layer-lens';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail) => {
    results.push(!!ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

(async () => {
    const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));

    await page.goto('https://www.windy.com/?-33.87,151.21,7', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.W && W.store && W.map && W.map.map && W.broadcast, null, { timeout: 60000 });
    await sleep(5000);

    // Record every settings write made from the MAIN window, to tell them apart from PIP writes later
    const settingsSnapshot = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('settings_') || k === 'lastSyncableUpdatedItem').sort()));
    await page.evaluate(() => {
        window.__mainWrites = new Set();
        const proto = Storage.prototype, set = proto.setItem, rm = proto.removeItem;
        proto.setItem = function (k, v) { window.__mainWrites.add(String(k)); return set.call(this, k, v); };
        proto.removeItem = function (k) { window.__mainWrites.add(String(k)); return rm.call(this, k); };
    });
    const lsBefore = await settingsSnapshot();

    const mountPlugin = () => page.evaluate(async ([url, name]) => {
        const slot = document.querySelector('[data-plugin="above-rhbottom"]');
        if (!slot) return { ok: false, err: 'no embedded slot' };
        const node = document.createElement('div');
        node.id = 'plugin-' + name;
        node.className = 'fg-white bg-gray-dark rounded-box dark-content';
        const x = document.createElement('div');
        x.className = 'closing-x';
        node.appendChild(x);
        slot.appendChild(node);
        setTimeout(() => node.classList.add('open'), 50);
        const mod = await import(url);
        window.__pipApp = new mod.default({ target: node, anchor: x, props: { pluginRootElement: node } });
        window.__pipNode = node;
        // Straight after mount the iframe still holds its blank window
        const w = document.querySelector('.pip iframe').contentWindow;
        w.__blankMarker = 1;
        return { ok: true, cfg: mod.__pluginConfig.name, title: mod.__pluginConfig.title, guardedWhileBlank: w.Storage.prototype.pipGuarded === true, href: w.location.href };
    }, [PLUGIN_URL, NAME]);
    const connected = async () => {
        await page.waitForFunction(() => !document.querySelector('.pip__status') && !document.querySelector('.pip__layer').disabled, null, { timeout: 90000 }).catch(() => {});
        return page.evaluate(() => (document.querySelector('.pip__status') || {}).textContent || '');
    };

    const introWatch = () => page.evaluate(() => new Promise(resolve => {
        const seen = { shown: false, hint: '', maxShift: 0 }, w = document.querySelector('.pip'), r0 = w.getBoundingClientRect(), t0 = performance.now();
        const tick = () => {
            const p = document.querySelector('.pip__pointer'), h = document.querySelector('.pip__hint'), r = w.getBoundingClientRect();
            if (p) { seen.shown = true; seen.hint = h ? h.innerText.replace(/\s+/g, ' ').trim() : ''; }
            seen.maxShift = Math.max(seen.maxShift, Math.round(Math.hypot(r.left - r0.left, r.top - r0.top)));
            if ((seen.shown && !p) || performance.now() - t0 > 12000) { seen.end = [Math.round(r.left - r0.left), Math.round(r.top - r0.top)]; seen.saved = JSON.parse(localStorage.getItem('windy-plugin-layer-lens') || '{}').box; resolve(seen); } else requestAnimationFrame(tick);
        };
        tick();
    }));
    const mount = await mountPlugin();
    check('plugin module mounts', mount.ok && mount.cfg === NAME, mount);
    check('settings guard installed before the second Windy loads', mount.guardedWhileBlank && mount.href === 'about:blank', mount);
    check('second Windy connects', (await connected()) === '');
    const introSeen = introWatch();
    await sleep(4000);

    const reuse = await page.evaluate(() => {
        const w = document.querySelector('.pip iframe').contentWindow;
        return { markerKept: w.__blankMarker === 1, guarded: w.Storage.prototype.pipGuarded === true, href: w.location.href.slice(0, 60) };
    });
    check('guard is on the window Windy actually runs in', reuse.guarded, reuse);

    // ---------- intro: a stand-in pointer drags the lens out and back, and nothing of it is kept
    const intro = await introSeen;
    check('intro: pointer and caption shown, lens glides out and back', intro.shown && /Drag this lens/.test(intro.hint) && intro.maxShift > 100 && intro.end.join() === '0,0', intro);
    await sleep(500);

    // ---------- shared helpers
    const inner = () => page.evaluate(() => { const s = document.querySelector('.pip iframe').contentWindow.W.store; return { overlay: s.get('overlay'), product: s.get('product'), level: s.get('level') }; });
    const outer = () => page.evaluate(() => ({ overlay: W.store.get('overlay'), product: W.store.get('product'), level: W.store.get('level'), ts: W.store.get('timestamp') }));
    const rectOf = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, sel);
    const hostRect = () => rectOf('.pip');
    // the middle of the lens itself: in seamless mode the map behind it is far bigger than the lens
    const viewCentre = () => page.evaluate(() => { const r = document.querySelector('.pip__view').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const barGrab = () => page.evaluate(() => { const t = document.querySelector('.pip__title').getBoundingClientRect(); return { x: Math.round(t.left + Math.min(t.width / 2, 30)), y: Math.round(t.top + t.height / 2), w: Math.round(t.width) }; });
    const drag = async (x0, y0, x1, y1) => {
        await page.mouse.move(x0, y0);
        await page.mouse.down();
        await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 8 });
        await page.mouse.move(x1, y1, { steps: 8 });
        await page.mouse.up();
    };
    const chip = () => page.evaluate(() => { const b = document.querySelector('.pip__layer'); return { name: b.querySelector('.pip__layer-name').textContent.trim(), model: (b.querySelector('small') || {}).textContent, img: (b.querySelector('img') || {}).naturalWidth }; });
    const tile = name => page.locator('.tile', { hasText: new RegExp('^\\s*(NEW|MBLUE)?\\s*' + name + '\\s*$') }).first();
    const chipBtn = (scope, name) => page.locator(scope + ' .chip', { hasText: name }).first();
    const optionsButton = '.pip__options';
    const pickOption = async name => {
        await page.click(optionsButton);
        await page.locator('.menu__choice button', { hasText: name }).click();
        await page.keyboard.press('Escape');
    };
    const savedNow = () => page.evaluate(name => JSON.parse(localStorage.getItem(name) || '{}'), NAME);

    // ---------- first use on desktop: a round, seamless lens
    const first = await page.evaluate(() => {
        const n = document.querySelector('.pip'), ve = document.querySelector('.pip__view'), v = ve.getBoundingClientRect(), w = n.getBoundingClientRect();
        return { round: n.classList.contains('pip--circle'), radius: getComputedStyle(ve).borderTopLeftRadius, view: [v.left, v.top, v.width, v.height].map(Math.round), window: [w.left, w.top, w.width, w.height].map(Math.round), viewport: [innerWidth, innerHeight], knob: !!document.querySelector('.pip__knob'), saved: JSON.parse(localStorage.getItem('windy-plugin-layer-lens') || '{}') };
    });
    const firstSeam = await page.evaluate(() => {
        const f = document.querySelector('.pip iframe').getBoundingClientRect(), m = W.map.map.getContainer().getBoundingClientRect(), a = W.map.map, b = document.querySelector('.pip iframe').contentWindow.W.map.map;
        return { overMain: [f.left - m.left, f.top - m.top, f.width - m.width, f.height - m.height].map(Math.round).join() === '0,0,0,0', sameZoom: Math.abs(a.getZoom() - b.getZoom()) < 0.01 };
    });
    check('first use: the lens is round and seamless', first.round && first.radius === '50%' && first.knob && first.view[2] === 300 && first.view[3] === 300 && first.window[0] === 16 && first.window[1] + first.window[3] === first.viewport[1] - 60 && firstSeam.overMain && firstSeam.sameZoom && first.saved.mode === 'seamless' && first.saved.shape === 'circle', { first, firstSeam });
    await page.screenshot({ path: SHOT + '-first-use.png' });
    // the remaining checks start from a rectangular window
    await pickOption('Rectangle');
    await sleep(1200);
    const afterShape = await page.evaluate(() => {
        const f = document.querySelector('.pip iframe').getBoundingClientRect(), m = W.map.map.getContainer().getBoundingClientRect(), w = document.querySelector('.pip').getBoundingClientRect();
        return { overMain: [f.left - m.left, f.top - m.top, f.width - m.width, f.height - m.height].map(Math.round), window: [w.left, w.top, w.width, w.height].map(Math.round) };
    });
    check('changing shape keeps the lens seamless without having to move it', afterShape.overMain.join() === '0,0,0,0' && afterShape.window[2] === 480 && afterShape.window[3] === 320, afterShape);

    // ---------- layout and toolbar
    const layout = await page.evaluate(() => {
        const n = document.querySelector('.pip'), r = n.getBoundingClientRect(), cs = getComputedStyle(n);
        const fr = n.querySelector('iframe'), f = fr.getBoundingClientRect(), w = fr.contentWindow;
        const im = w.W.map.map.getContainer().getBoundingClientRect();
        const bar = n.querySelector('.pip__bar');
        return {
            rect: [r.left, r.top, r.width, r.height].map(Math.round),
            pos: cs.position, parent: n.parentElement.tagName, hostDisplay: getComputedStyle(window.__pipNode).display,
            iframe: [f.width, f.height].map(Math.round), innerMap: [im.left, im.top, im.width, im.height].map(Math.round),
            top: document.elementFromPoint(r.left + 100, r.top + 100) === fr,
            title: n.querySelector('.pip__title').textContent.replace(/\s+/g, ' ').trim(), logo: !!n.querySelector('.pip__title svg'), barHeight: Math.round(bar.getBoundingClientRect().height),
            zoomButtons: n.querySelectorAll('.pip__zoom').length, legend: n.querySelectorAll('.pip__legend').length, selects: bar.querySelectorAll('select').length,
            icons: [...bar.querySelectorAll('.pip__icon')].map(b => b.textContent.trim() || (b.querySelector('svg') ? 'svg' : '')), modeButtons: n.querySelectorAll('.pip__modes').length,
            seGrip: !!n.querySelector('.pip__grip--se svg'), titleFont: getComputedStyle(n.querySelector('.pip__title')).fontFamily, fontLoaded: document.fonts.check('17px bariolmedium'),
            grips: n.querySelectorAll('.pip__grip').length, coverButton: !!bar.querySelector('.pip__cover svg'),
            visibleInner: [...w.document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName),
        };
    });
    check('PIP floats outside Windy\'s container', layout.pos === 'fixed' && layout.parent === 'BODY' && layout.hostDisplay === 'none' && layout.top, layout);
    check('toolbar: title shown, zoom buttons and legend gone', layout.title === 'Layer Lens' && layout.logo && layout.zoomButtons === 0 && layout.legend === 0 && layout.selects === 0 && layout.barHeight === 32, layout);
    check('toolbar: view modes moved into the ⋯ menu, resize mark in the corner, title in Windy\'s typeface', layout.icons.join() === 'svg,⋯,✕' && layout.coverButton && layout.modeButtons === 0 && layout.seGrip && /bariolmedium/.test(layout.titleFont) && layout.fontLoaded, { icons: layout.icons, seGrip: layout.seGrip, titleFont: layout.titleFont });
    check('inner map fills the PIP view, chrome hidden', layout.innerMap.join() === [0, 0, ...layout.iframe].join() && layout.visibleInner.join() === 'map-container', layout);
    let c = await chip();
    check('toolbar: layer chip shows a layer that stands out, with model and thumbnail', c.name === 'Temperature' && c.model === 'ECMWF' && c.img > 0, c);

    // ---------- layer picker
    const main0 = await outer();
    await page.click('.pip__layer');
    await sleep(600);
    // the thumbnails come from windy.com: give them time rather than failing on a slow fetch
    await page.waitForFunction(() => [...document.querySelectorAll('.pip__panel .tile img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
    const pk = await page.evaluate(() => {
        const p = document.querySelector('.pip__panel'), r = p.getBoundingClientRect(), w = document.querySelector('.pip').getBoundingClientRect();
        const imgs = [...p.querySelectorAll('.tile img')];
        return {
            rect: [r.left, r.top, r.width, r.height].map(Math.round), pip: [w.left, w.top, w.width, w.height].map(Math.round),
            overlapsPip: !(r.left >= w.right || r.right <= w.left || r.top >= w.bottom || r.bottom <= w.top),
            inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            onTop: p.contains(document.elementFromPoint(r.left + 40, r.top + 40)),
            title: p.querySelector('.picker__title').textContent, tabs: [...p.querySelectorAll('.picker__tabs .chip')].map(b => b.textContent.trim() + (b.classList.contains('chip--on') ? '*' : '')),
            tiles: [...p.querySelectorAll('.tile__name')].map(t => t.textContent.trim()), selected: [...p.querySelectorAll('.tile--on .tile__name')].map(t => t.textContent.trim()),
            imagesLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length + '/' + imgs.length,
            focus: document.activeElement === p.querySelector('.picker__search'),
        };
    });
    check('picker opens beside the window, on screen, on top', !pk.overlapsPip && pk.inViewport && pk.onTop && pk.rect[2] === 360, pk);
    check('picker: shows current layer, groups and thumbnails', pk.title === 'Temperature' && pk.tabs[0] === 'Popular*' && pk.tabs.length === 9 && pk.tiles.length === 12 && pk.selected.join() === 'Temperature' && pk.imagesLoaded === '12/12' && pk.focus, pk);
    await page.screenshot({ path: SHOT + '-picker-popular.png' });

    await tile('Wind').click();
    await sleep(2500);
    let i1 = await inner();
    const opts = await page.evaluate(() => {
        const p = document.querySelector('.pip__panel');
        const choices = label => { const sel = p.querySelector(`select[title="${label}"]`); return sel ? [...sel.options].map(o => o.textContent.trim() + (o.selected ? '*' : '')) : null; };
        const header = p.querySelector('.picker__now').getBoundingClientRect();
        return { open: !!p, title: p.querySelector('.picker__title').textContent, models: choices('Forecast model'), levels: choices('Altitude'), chips: p.querySelectorAll('.picker__now .chip').length, headerHeight: Math.round(header.height) };
    });
    c = await chip();
    check('picker: picking a tile switches the PIP layer and stays open', i1.overlay === 'wind' && opts.open && opts.title === 'Wind' && c.name === 'Wind', { i1, c });
    check('picker: models and altitudes offered for Wind, on one line of drop-downs', opts.models.length >= 3 && opts.models.includes('ECMWF 9km*') && opts.levels[0] === 'Surface*' && opts.levels.length >= 10 && opts.chips === 0 && opts.headerHeight <= 80, opts);

    await page.selectOption('.pip__panel select[title="Forecast model"]', 'gfs');
    await sleep(2500);
    await page.selectOption('.pip__panel select[title="Altitude"]', '850h');
    await sleep(2000);
    i1 = await inner();
    c = await chip();
    let m1 = await outer();
    check('picker: model and altitude change the PIP only', i1.product === 'gfs' && i1.level === '850h' && c.model === 'GFS' && m1.product === main0.product && m1.level === main0.level && m1.overlay === main0.overlay, { i1, c, m1 });
    await page.screenshot({ path: SHOT + '-picker-wind.png' });

    await chipBtn('.picker__tabs', 'Warnings').click();
    await sleep(400);
    await tile('Fire danger').click();
    await sleep(2500);
    const fam = await page.evaluate(() => { const p = document.querySelector('.pip__panel'), sel = p.querySelector('select[title="Type"]'); return { title: p.querySelector('.picker__title').textContent, variants: sel ? [...sel.options].map(o => o.textContent.trim() + (o.selected ? '*' : '')) : [], tiles: [...p.querySelectorAll('.tile__name')].map(t => t.textContent.trim()) }; });
    i1 = await inner();
    check('picker: a family shows its variants', i1.overlay === 'fwi' && fam.title === 'Fire danger' && fam.variants.join('|') === 'Fire spread*|Fuel moisture 10h|Fuel moisture 100h|Fuel moisture 1000h', { i1, fam });
    await page.selectOption('.pip__panel select[title="Type"]', 'dfm100h');
    await sleep(2500);
    i1 = await inner();
    c = await chip();
    check('picker: picking a variant switches to it', i1.overlay === 'dfm100h' && c.name === 'Fuel moisture', { i1, c });
    await page.screenshot({ path: SHOT + '-picker-family.png' });

    // search: typing must reach the search box only, not Windy's keyboard shortcuts
    const before = await outer();
    await page.click('.picker__search');
    await page.keyboard.type('swell', { delay: 40 });
    await sleep(500);
    const found = await page.evaluate(() => ({ tiles: [...document.querySelectorAll('.pip__panel .tile__name')].map(t => t.textContent.trim()), tabs: document.querySelectorAll('.pip__panel .picker__tabs').length }));
    await page.keyboard.press('Enter');
    await sleep(2500);
    i1 = await inner();
    const after = await outer();
    check('picker: search filters, Enter picks the first match', found.tiles.join('|') === 'Swell|Swell 2|Swell 3' && found.tabs === 0 && i1.overlay === 'swell1', { found, i1 });
    check('picker: typing does not trigger Windy shortcuts', JSON.stringify(before) === JSON.stringify(after), { before, after });
    await page.fill('.picker__search', 'zzzz');
    await sleep(300);
    const none = await page.evaluate(() => (document.querySelector('.pip__panel .picker__empty') || {}).textContent);
    check('picker: says so when nothing matches', /No layer matches/.test(none || ''), none);

    await page.keyboard.press('Escape');
    await sleep(300);
    const esc = await page.evaluate(() => ({ picker: !!document.querySelector('.pip__panel'), pip: !!document.querySelector('.pip') }));
    check('Escape closes the picker, not the plugin', !esc.picker && esc.pip, esc);
    await page.click('.pip__layer');
    await sleep(400);
    await page.mouse.click(900, 250);
    await sleep(300);
    const out1 = await page.evaluate(() => !!document.querySelector('.pip__panel'));
    await page.evaluate(() => W.broadcast.emit('rqstClose', 'picker')); // close the weather picker that click opened on the main map
    await page.click('.pip__layer');
    await sleep(400);
    let [vx, vy] = await viewCentre();
    await page.mouse.click(vx, vy);
    await sleep(300);
    const out2 = await page.evaluate(() => !!document.querySelector('.pip__panel'));
    check('clicking the main map or the PIP map closes the picker', !out1 && !out2, { out1, out2 });

    // ---------- the lens is for looking: a click on its map opens nothing, panning and zooming still work
    const lensState = () => page.evaluate(() => { const w = document.querySelector('.pip iframe').contentWindow, c = w.W.map.map.getCenter(); return { picker: w.document.body.classList.contains('onpicker'), open: Object.keys(w.W.plugins).filter(k => w.W.plugins[k].isOpen).sort().join(), centre: [c.lat.toFixed(3), c.lng.toFixed(3)].join(), zoom: w.W.map.map.getZoom() }; });
    const q0 = await lensState();
    [vx, vy] = await viewCentre();
    await page.mouse.click(vx - 60, vy + 30);
    await sleep(2000);
    const q1 = await lensState();
    check('clicking the lens\'s map opens no picker or forecast', !q1.picker && q1.open === q0.open && q1.centre === q0.centre, { q0, q1 });
    await drag(vx, vy, vx + 50, vy + 25);
    await sleep(1500);
    const q2 = await lensState();
    await page.mouse.dblclick(vx, vy);
    await sleep(2500);
    const q3 = await lensState();
    check('the lens still pans by drag and zooms by double-click', q2.centre !== q1.centre && q3.zoom > q2.zoom && !q3.picker, { q2, q3 });
    await page.evaluate(() => W.map.map.setView([-33.87, 151.21], 7, { animate: false }));
    await page.mouse.click(1300, 500); // main leads again
    await page.evaluate(() => W.broadcast.emit('rqstClose', 'picker'));
    await sleep(1500);

    // leave the PIP on a layer that differs clearly from main for the view-mode checks
    await page.click('.pip__layer');
    await sleep(300);
    await chipBtn('.picker__tabs', 'Temperature').click();
    await tile('Temperature').click();
    await sleep(2500);
    // With the picker still open, pan the lens: the press that closes the picker must not
    // stop the main map following this very pan (it did until 0.1.3)
    const mainBefore = await page.evaluate(() => { const c = W.map.map.getCenter(); return [c.lat, c.lng]; });
    [vx, vy] = await viewCentre();
    await drag(vx, vy, vx - 90, vy + 50);
    await sleep(1500);
    const afterLayerPan = await page.evaluate(([la, lo]) => { const c = W.map.map.getCenter(); return { moved: Math.abs(c.lat - la) > 1e-3 || Math.abs(c.lng - lo) > 1e-3, pickerOpen: !!document.querySelector('.pip__panel') }; }, mainBefore);
    check('after a layer change, the first pan of the lens moves the main map', afterLayerPan.moved && !afterLayerPan.pickerOpen, afterLayerPan);
    await page.keyboard.press('Escape');
    i1 = await inner();
    check('PIP on Temperature for the view-mode checks', i1.overlay === 'temp', i1);

    // ---------- measurements
    // FULL: same centre, PIP zoomed out so the whole main view fits inside it
    const full = () =>
        page.evaluate(() => {
            const f = document.querySelector('.pip iframe'), r = f.getBoundingClientRect();
            const a = W.map.map, b = f.contentWindow.W.map.map, mr = a.getContainer().getBoundingClientRect();
            const want = Math.log2(Math.min(r.width / mr.width, r.height / mr.height));
            const toPip = (x, y) => { const ll = a.containerPointToLatLng([x, y]); const p = b.latLngToContainerPoint([ll.lat, ll.lng]); return [p.x, p.y]; };
            const [x1, y1] = toPip(0, 0), [x2, y2] = toPip(mr.width, mr.height), [cx, cy] = toPip(mr.width / 2, mr.height / 2);
            const rd = v => Math.round(v * 100) / 100;
            return { zoomDiff: rd(b.getZoom() - a.getZoom()), want: rd(want), centrePxErr: rd(Math.hypot(cx - r.width / 2, cy - r.height / 2)), mainInPip: [x1, y1, x2, y2].map(rd), pip: [r.width, r.height].map(Math.round), mainZoom: rd(a.getZoom()) };
        });
    const fullOk = m => Math.abs(m.zoomDiff - m.want) < 0.01 && m.centrePxErr < 1 && m.mainInPip[0] > -1 && m.mainInPip[1] > -1 && m.mainInPip[2] < m.pip[0] + 1 && m.mainInPip[3] < m.pip[1] + 1 && (m.mainInPip[0] < 1 || m.mainInPip[1] < 1);

    // SEAMLESS: every PIP pixel shows the same place as the main-map pixel underneath it
    const seam = () =>
        page.evaluate(() => {
            const f = document.querySelector('.pip iframe'), r = f.getBoundingClientRect();
            const a = W.map.map, b = f.contentWindow.W.map.map, mr = a.getContainer().getBoundingClientRect();
            const err = (px, py) => { const ll = a.containerPointToLatLng([r.left - mr.left + px, r.top - mr.top + py]); const p = b.latLngToContainerPoint([ll.lat, ll.lng]); return Math.hypot(p.x - px, p.y - py); };
            const rd = v => Math.round(v * 100) / 100;
            const cc = a.getCenter();
            const v = document.querySelector('.pip__view').getBoundingClientRect();
            // sample the pixels the lens actually shows: its corners and middle
            const at = (x, y) => err(v.left - r.left + x, v.top - r.top + y);
            return { pxErr: [at(0, 0), at(v.width, v.height), at(v.width / 2, v.height / 2), at(v.width, 0)].map(rd), zoomDiff: rd(b.getZoom() - a.getZoom()), view: [v.left, v.top, v.width, v.height].map(Math.round), overMain: [r.left - mr.left, r.top - mr.top, r.width - mr.width, r.height - mr.height].map(Math.round).join() === '0,0,0,0', main: [rd(cc.lat), rd(cc.lng), rd(a.getZoom())] };
        });
    const seamOk = m => Math.max(...m.pxErr) < 1 && Math.abs(m.zoomDiff) < 0.01 && m.overMain;
    // counts how often the lens's own map moves: while only the window is dragged it must not, or its wind animation restarts
    const innerMoves = () => page.evaluate(() => { const b = document.querySelector('.pip iframe').contentWindow.W.map.map; if (!window.__mv) { window.__mv = { n: 0 }; b.on('move', () => window.__mv.n++); } const n = window.__mv.n; window.__mv.n = 0; return n; });

    // ---------- SEAMLESS is what a fresh PIP starts in
    const sStart = await seam();
    check('Seamless from the start: PIP shows exactly what it covers', seamOk(sStart), sStart);

    // ---------- FULL mode
    await pickOption('Full');
    await sleep(2500);
    let m = await full();
    check('Full: main view fits inside the PIP, same centre', fullOk(m), m);
    await drag(800, 300, 600, 220);
    await sleep(2500);
    m = await full();
    check('Full: dragging main keeps the fit', fullOk(m), m);
    await page.mouse.move(800, 300);
    await page.mouse.wheel(0, -400);
    await sleep(3000);
    const mz = await full();
    check('Full: zooming main keeps the fit', fullOk(mz) && mz.mainZoom !== m.mainZoom, mz);
    [vx, vy] = await viewCentre();
    const c0 = await page.evaluate(() => { const cc = W.map.map.getCenter(); return [cc.lat, cc.lng]; });
    await drag(vx, vy, vx + 80, vy + 40);
    await sleep(2500);
    m = await full();
    const c1 = await page.evaluate(() => { const cc = W.map.map.getCenter(); return [cc.lat, cc.lng]; });
    check('Full: dragging inside the PIP moves main, fit kept', fullOk(m) && (c0[0] !== c1[0] || c0[1] !== c1[1]), { m, c0, c1 });

    // resize from the top edge all the way up
    const r0 = await hostRect();
    await page.mouse.click(800, 300); // main leads again
    await page.evaluate(() => W.broadcast.emit('rqstClose', 'picker'));
    await drag(r0[0] + r0[2] / 2, r0[1] + 2, r0[0] + r0[2] / 2, -50);
    await sleep(2000);
    const r1 = await hostRect();
    check('top edge drags up to the top of the viewport', r1[1] === 0 && r1[3] === r0[1] + r0[3] && r1[0] === r0[0] && r1[2] === r0[2], { r0, r1 });
    m = await full();
    check('Full: fit recomputed after the resize', fullOk(m) && m.pip[1] > 500, m);
    const overSearch = await page.evaluate(() => {
        const pipEl = document.querySelector('.pip'), bar = document.querySelector('.pip__bar').getBoundingClientRect();
        const pts = [[bar.left + 20, bar.top + 3], [bar.left + bar.width / 2, bar.top + bar.height / 2], [bar.left + 100, bar.bottom + 60]];
        return pts.map(([x, y]) => pipEl.contains(document.elementFromPoint(x, y)));
    });
    check('stays on top of Windy\'s search box and forecast card', overSearch.every(Boolean), overSearch);
    // with the window tall and at the left, the picker still goes beside it
    await page.click('.pip__layer');
    await sleep(500);
    const pk2 = await page.evaluate(() => { const r = document.querySelector('.pip__panel').getBoundingClientRect(), w = document.querySelector('.pip').getBoundingClientRect(); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), beside: r.left >= w.right, inViewport: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth }; });
    check('picker fits on screen beside a tall window', pk2.beside && pk2.inViewport, pk2);
    await page.screenshot({ path: SHOT + '-full.png' });
    await page.keyboard.press('Escape');
    await drag(r1[0] + r1[2] / 2, 2, r1[0] + r1[2] / 2, 600);
    await sleep(1000);

    // ---------- back to SEAMLESS
    await pickOption('Seamless');
    await sleep(2500);
    let s = await seam();
    check('Seamless: PIP shows exactly what it covers', seamOk(s) && (await savedNow()).mode === 'seamless', s);

    const g = await barGrab();
    await innerMoves();
    await drag(g.x, g.y, g.x + 500, g.y - 250);
    await sleep(2000);
    const s1 = await seam();
    const moved = await innerMoves();
    check('Seamless: stays aligned after moving the window (main map untouched)', seamOk(s1) && s1.view[0] === s.view[0] + 500 && s1.view[1] === s.view[1] - 250 && s1.main.join() === s.main.join(), { s, s1 });
    check('Seamless: moving the window does not move the lens\'s map (wind animation keeps running)', moved === 0, moved);

    const g2 = await barGrab();
    await page.mouse.move(g2.x, g2.y);
    await page.mouse.down();
    await page.mouse.move(g2.x - 180, g2.y + 90, { steps: 6 });
    await sleep(400);
    const sMid = await seam();
    await page.mouse.up();
    check('Seamless: aligned mid-drag, before the window is released', seamOk(sMid) && sMid.view[0] === s1.view[0] - 180, sMid);

    const r2 = await hostRect();
    await innerMoves();
    await drag(r2[0] + r2[2] - 3, r2[1] + r2[3] - 3, r2[0] + r2[2] + 117, r2[1] + r2[3] + 77);
    await sleep(2000);
    const r3 = await hostRect();
    const s2 = await seam();
    check('Seamless: stays aligned after a corner resize, map inside untouched', seamOk(s2) && (await innerMoves()) === 0 && r3[2] === r2[2] + 120 && r3[3] === r2[3] + 80 && r3[0] === r2[0] && r3[1] === r2[1], { r2, r3, s2 });

    await drag(300, 300, 380, 360);
    await sleep(2500);
    const s3 = await seam();
    check('Seamless: stays aligned when main is dragged', seamOk(s3) && s3.main.join() !== s2.main.join(), s3);
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 300);
    await sleep(3000);
    const s4 = await seam();
    check('Seamless: stays aligned when main is zoomed', seamOk(s4) && s4.main[2] !== s3.main[2], s4);

    [vx, vy] = await viewCentre();
    await drag(vx, vy, vx - 70, vy + 45);
    await sleep(2500);
    const s5 = await seam();
    check('Seamless: dragging inside the PIP moves main with it', seamOk(s5) && s5.main.join() !== s4.main.join(), s5);
    await page.mouse.move(vx + 60, vy - 30);
    await page.mouse.wheel(0, -300);
    await sleep(3000);
    const s6 = await seam();
    check('Seamless: zooming inside the PIP zooms main with it', seamOk(s6) && s6.main[2] !== s5.main[2], s6);

    // Windy's menu and settings panes slide the whole main map aside (until 0.1.4 the lens stayed put)
    const mainLeft = () => page.evaluate(() => Math.round(W.map.map.getContainer().getBoundingClientRect().left));
    // Waits for the map to slide and come to rest (the pane may take a while to load first).
    // The lens is also measured the first time the map is seen to have moved, usually mid-slide.
    const slide = async from => {
        let mid = null, last = from, still = 0;
        for (let t = 0; t < 15000 && (last === from || still < 10); t += 50) {
            const left = await mainLeft();
            if (left === last) still++;
            else { still = 0; mid = mid || { left, seam: await seam() }; }
            last = left;
            await sleep(50);
        }
        return { left: last, mid, seam: await seam() };
    };
    await page.evaluate(() => W.broadcast.emit('rqstOpen', 'menu'));
    const paneOpen = await slide(0);
    await page.evaluate(() => W.broadcast.emit('rqstClose', 'menu'));
    const paneShut = await slide(paneOpen.left);
    const midOk = s => s.mid && seamOk(s.mid.seam);
    check('Seamless: stays aligned while Windy\'s menu pushes the map aside, and after it closes', paneOpen.left < -100 && seamOk(paneOpen.seam) && paneShut.left === 0 && seamOk(paneShut.seam) && midOk(paneOpen) && midOk(paneShut), { paneOpen, paneShut });
    await sleep(2500);
    await page.screenshot({ path: SHOT + '-seamless.png' });

    // ---------- circle
    const rectBefore = await hostRect();
    await pickOption('Circle');
    await sleep(1500);
    const circle = await page.evaluate(() => {
        const w = document.querySelector('.pip').getBoundingClientRect(), ve = document.querySelector('.pip__view'), v = ve.getBoundingClientRect(), k = document.querySelector('.pip__knob').getBoundingClientRect(), bar = document.querySelector('.pip__bar').getBoundingClientRect();
        const cx = v.left + v.width / 2, cy = v.top + v.height / 2;
        return { window: [w.left, w.top, w.width, w.height].map(Math.round), view: [v.left, v.top, v.width, v.height].map(Math.round), radius: getComputedStyle(ve).borderTopLeftRadius, knobOffRim: Math.round(Math.hypot(k.left + k.width / 2 - cx, k.top + k.height / 2 - cy) - v.width / 2), cornerGoesTo: document.elementFromPoint(v.left + 4, v.top + 4).className, centreGoesTo: document.elementFromPoint(cx, cy).tagName, grips: document.querySelectorAll('.pip__grip').length, titleWords: getComputedStyle(document.querySelector('.pip__title span')).display, barAboveLens: Math.round(v.top - bar.bottom) };
    });
    const sc = await seam();
    check('Circle: round lens with a knob on its rim, corners left to the map', circle.view[2] === circle.view[3] && circle.radius === '50%' && circle.knobOffRim === 0 && circle.cornerGoesTo === 'maplibregl-canvas' && circle.centreGoesTo === 'IFRAME' && circle.grips === 0 && circle.titleWords === 'none', circle);
    check('Circle: keeps its middle when changing shape, still seamless', Math.abs((circle.window[0] + circle.window[2] / 2) - (rectBefore[0] + rectBefore[2] / 2)) <= 1 && seamOk(sc), { rectBefore, circle: circle.window, sc });
    const knob = await rectOf('.pip__knob');
    await drag(knob[0] + 9, knob[1] + 9, knob[0] + 69, knob[1] + 69);
    await sleep(800);
    const circle2 = await rectOf('.pip__view');
    check('Circle: the knob resizes it and it stays round', circle2[2] === circle.view[2] + 60 && circle2[3] === circle2[2] && circle2[0] === circle.view[0], { before: circle.view, after: circle2 });
    const gc = await barGrab();
    await innerMoves();
    await drag(gc.x, gc.y, gc.x - 120, gc.y - 60);
    await sleep(800);
    const circle3 = await rectOf('.pip__view');
    const sc3 = await seam();
    check('Circle: drags by the mark on its pill, stays seamless', circle3[0] === circle2[0] - 120 && circle3[1] === circle2[1] - 60 && seamOk(sc3) && (await innerMoves()) === 0, { circle3, sc3 });
    await page.screenshot({ path: SHOT + '-circle.png' });

    // ---------- about
    await page.click(optionsButton);
    await page.click('.menu__about');
    await sleep(400);
    const about = await page.evaluate(() => { const p = document.querySelector('.pip__panel--about'), r = p.getBoundingClientRect(); return { text: p.innerText.replace(/\s+/g, ' ').trim(), links: [...p.querySelectorAll('a')].map(a => a.getAttribute('href')), centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2, onTop: p.contains(document.elementFromPoint(r.left + 30, r.top + 30)) }; });
    check('About: Layer Lens by Appd, with contact links', /Layer Lens by Appd/.test(about.text) && /feedback, suggestions, or questions/.test(about.text) && about.links.join() === 'mailto:hello@appd.com.au,https://appd.com.au' && about.centred && about.onTop, about);
    await page.keyboard.press('Escape');
    await sleep(300);
    check('About: Escape closes it', !(await rectOf('.pip__panel')));

    await pickOption('Rectangle');
    await sleep(1000);
    const rectAfter = await hostRect();
    check('Rectangle again: gets its previous size back', rectAfter[2] === rectBefore[2] && rectAfter[3] === rectBefore[3], { rectBefore, rectAfter });

    const gb = await barGrab();
    await drag(gb.x, gb.y, gb.x, gb.y + 2000);
    await sleep(1500);
    const rb = await hostRect();
    const vp = await page.evaluate(() => [innerWidth, innerHeight]);
    const sb = await seam();
    check('window drags down until it touches the bottom edge, still aligned', rb[1] + rb[3] === vp[1] && seamOk(sb), { rb, vp, sb });

    // ---------- opacity: the main map shows through the lens
    const lensBox = await hostRect();
    await page.click(optionsButton);
    await page.locator('.menu__slider').fill('30');
    await sleep(400);
    const faded = await page.evaluate(() => {
        const n = document.querySelector('.pip');
        return { iframe: getComputedStyle(n.querySelector('iframe')).opacity, label: document.querySelector('.menu__value').textContent, windowFill: getComputedStyle(n).backgroundColor, barFill: getComputedStyle(n.querySelector('.pip__bar')).backgroundColor, rows: [...document.querySelectorAll('.menu__label')].map(l => l.textContent), version: document.querySelector('.menu__version').textContent, saved: JSON.parse(localStorage.getItem('windy-plugin-layer-lens')).opacity };
    });
    await page.keyboard.press('Escape');
    const pkgVersion = require(__dirname + '/../package.json').version;
    check('menu: shows the version, the same as package.json', faded.version === 'v' + pkgVersion, { shown: faded.version, pkgVersion });
    check('opacity: the lens fades to 30% and nothing but the map is behind it', faded.iframe === '0.3' && faded.label === '30%' && faded.windowFill === 'rgba(0, 0, 0, 0)' && faded.barFill !== 'rgba(0, 0, 0, 0)' && faded.rows.join() === 'View,Shape,Opacity' && faded.saved.lens === 0.3, faded);
    await sleep(1500);
    await page.screenshot({ path: SHOT + '-opacity.png' });

    // ---------- covering the whole map, from Full view: over the whole map it is seamless all the same
    await pickOption('Full');
    await sleep(800);
    await page.click('.pip__cover');
    await sleep(1500);
    const cover = await page.evaluate(() => {
        const n = document.querySelector('.pip'), v = n.querySelector('.pip__view'), f = n.querySelector('iframe'), bar = n.querySelector('.pip__bar');
        const vr = v.getBoundingClientRect(), br = bar.getBoundingClientRect();
        const name = e => e ? `${e.tagName}.${String(e.className).split(' ')[0]}` : null;
        const mid = [innerWidth / 2, innerHeight / 2];
        const press = document.elementFromPoint(...mid);
        // Which is drawn on top, the lens or Windy's UI: hit-test the lens as if it took presses
        v.style.pointerEvents = 'auto';
        const s = document.querySelector('#search').getBoundingClientRect();
        const overSearch = document.elementFromPoint(s.left + 30, s.top + 20);
        const overMap = document.elementFromPoint(...mid);
        v.style.pointerEvents = '';
        return {
            view: [vr.left, vr.top, vr.width, vr.height].map(Math.round), viewport: [innerWidth, innerHeight], opacity: getComputedStyle(f).opacity,
            press: name(press), searchOnTop: !v.contains(overSearch), lensOverMap: overMap === f,
            bar: [br.left + br.width / 2, br.top].map(Math.round), barOnTop: bar.contains(document.elementFromPoint(br.left + 10, br.top + br.height / 2)),
            grips: n.querySelectorAll('.pip__grip, .pip__knob').length, saved: JSON.parse(localStorage.getItem('windy-plugin-layer-lens')),
        };
    });
    const cv0 = await seam();
    check('cover: the lens lies over the whole map at full strength, under Windy\'s UI, aligned', cover.view.join() === [0, 0, ...cover.viewport].join() && cover.opacity === '1' && cover.searchOnTop && cover.lensOverMap && seamOk(cv0) && cover.grips === 0 && cover.saved.cover === true, { cover, cv0 });
    check('cover: presses reach the main map; the bar floats where the window\'s bar was', /maplibregl-canvas/.test(cover.press) && cover.barOnTop && Math.abs(cover.bar[0] - (lensBox[0] + lensBox[2] / 2)) <= 1 && cover.bar[1] === lensBox[1], { press: cover.press, bar: cover.bar, lensBox });
    await page.screenshot({ path: SHOT + '-cover.png' });
    await drag(700, 400, 610, 340);
    await sleep(2500);
    const cv1 = await seam();
    check('cover: dragging the map moves both, still aligned', seamOk(cv1) && cv1.main.join() !== cv0.main.join(), cv1);
    await page.click(optionsButton);
    const coverMenu = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.menu__label')].map(l => l.textContent), choices: [...document.querySelectorAll('.menu__choice button')].map(b => (b.disabled ? 'off:' : '') + b.textContent.trim() + (b.classList.contains('on') ? '*' : '')) }));
    await page.locator('.menu__slider').fill('70');
    await sleep(300);
    const coverOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('.pip iframe')).opacity);
    await page.keyboard.press('Escape');
    check('cover: view and shape shown off, as the lens is now (seamless, no shape), the window\'s Full view kept; opacity kept apart from the lens\'s', coverMenu.rows.join() === 'View,Shape,Opacity' && coverMenu.choices.join() === 'off:Seamless*,off:Full,off:Rectangle,off:Circle' && coverOpacity === '0.7' && (await savedNow()).mode === 'full', { coverMenu, coverOpacity });
    await page.click('.pip__layer');
    await sleep(600);
    const coverPicker = await page.evaluate(() => { const p = document.querySelector('.pip__panel').getBoundingClientRect(), b = document.querySelector('.pip__bar').getBoundingClientRect(); return { onScreen: p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight, byBar: p.top >= b.bottom || p.bottom <= b.top }; });
    await page.keyboard.press('Escape');
    check('cover: the layer picker opens from the bar, on screen', coverPicker.onScreen && coverPicker.byBar, coverPicker);
    await page.click('.pip__cover');
    await sleep(1500);
    const backFull = { mode: (await savedNow()).mode, fit: await full() };
    check('cover: going back returns to the Full view it came from', backFull.mode === 'full' && fullOk(backFull.fit), backFull);
    await pickOption('Seamless');
    await sleep(1500);
    const back = { box: await hostRect(), seam: await seam(), opacity: await page.evaluate(() => getComputedStyle(document.querySelector('.pip iframe')).opacity), saved: await savedNow() };
    check('cover: going back gives the lens its window, place and opacity again', back.box.join() === lensBox.join() && seamOk(back.seam) && back.opacity === '0.3' && back.saved.cover === false && back.saved.opacity.cover === 0.7, back);
    await page.click(optionsButton);
    await page.locator('.menu__slider').fill('100');
    await page.keyboard.press('Escape');
    await sleep(500);

    // ---------- isolation, time, settings
    await page.evaluate(() => W.store.set('overlay', 'clouds'));
    await sleep(2000);
    const ov2 = { inner: await inner(), outer: await outer() };
    check('main layer change does not leak into PIP', ov2.inner.overlay === 'temp' && ov2.outer.overlay === 'clouds', ov2);
    const ts = await page.evaluate(async () => {
        const w = document.querySelector('.pip iframe').contentWindow;
        W.store.set('timestamp', W.store.get('timestamp') + 12 * 3600 * 1000);
        await new Promise(r => setTimeout(r, 1500));
        return { outer: W.store.get('timestamp'), inner: w.W.store.get('timestamp') };
    });
    check('forecast time follows main', ts.outer === ts.inner, ts);
    const guard = await page.evaluate(() => {
        const w = document.querySelector('.pip iframe').contentWindow;
        const before = localStorage.getItem('settings_particlesAnim');
        w.W.store.set('particlesAnim', 'off'); // a persisted setting
        return { before, after: localStorage.getItem('settings_particlesAnim'), innerVal: w.W.store.get('particlesAnim'), outerVal: W.store.get('particlesAnim') };
    });
    check('PIP cannot write shared settings', guard.before === guard.after && guard.innerVal === 'off' && guard.outerVal !== 'off', guard);

    // ---------- time across radar and forecast layers
    const times = () => page.evaluate(() => { const l = document.querySelector('.pip iframe').contentWindow.W.store, own = ['radar', 'satellite'].includes(l.get('overlay')); return { main: W.store.get('timestamp'), lens: l.get(own ? 'radsatTimestamp' : 'timestamp'), lensLayer: l.get('overlay') }; });
    const scrubRadar = part => page.evaluate(part => { const c = W.store.get('radarCalendar'); W.store.set('radsatTimestamp', c.timestamps[Math.floor(c.timestamps.length * part)]); }, part);
    const lensTo = id => page.evaluate(id => document.querySelector('.pip iframe').contentWindow.W.store.set('overlay', id), id);
    await page.evaluate(() => W.store.set('overlay', 'radar'));
    await sleep(6000);
    await scrubRadar(0.4);
    await sleep(2500);
    const t1 = await times();
    check('radar on main: scrubbing moves a forecast layer in the lens', t1.lens === t1.main && t1.lensLayer === 'temp', t1);
    await lensTo('radar');
    await sleep(6000);
    const t2 = await times();
    await scrubRadar(0.7);
    await sleep(3000);
    const t3 = await times();
    check('radar on main: scrubbing moves radar in the lens', t2.lens === t2.main && t3.lens === t3.main && t3.main !== t2.main && t3.lensLayer === 'radar', { t2, t3 });
    await lensTo('temp');
    await sleep(6000);
    const t4 = await times();
    check('lens back on a forecast layer keeps the main map\'s time', t4.lens === t4.main && t4.lensLayer === 'temp', t4);
    await page.evaluate(() => W.store.set('overlay', 'clouds'));
    await sleep(5000);
    const t5 = await times();
    check('main back on a forecast layer: lens still in step', t5.lens === t5.main, t5);

    // ---------- remembered state: pick model + altitude, close, reopen
    await page.click('.pip__layer');
    await sleep(300);
    await chipBtn('.picker__tabs', 'Wind').click();
    await tile('Wind').click();
    await sleep(2500);
    await page.selectOption('.pip__panel select[title="Forecast model"]', 'icon');
    await sleep(2500);
    await page.selectOption('.pip__panel select[title="Altitude"]', '700h');
    await sleep(1500);
    await page.keyboard.press('Escape');
    const savedState = await page.evaluate(name => JSON.parse(localStorage.getItem(name)), NAME);
    const boxBefore = await hostRect();
    check('state is saved (layer, model, altitude, mode, shape, box)', savedState.overlay === 'wind' && savedState.product === 'icon' && savedState.level === '700h' && savedState.mode === 'seamless' && savedState.shape === 'rectangle' && savedState.box.width === boxBefore[2], savedState);

    const td = await page.evaluate(() => {
        window.__pipApp.$destroy();
        window.__pipNode.remove();
        return { frames: document.querySelectorAll('iframe').length, windows: document.querySelectorAll('.pip, .pip__panel').length };
    });
    check('destroy removes the PIP window', td.frames === 0 && td.windows === 0, td);

    await mountPlugin();
    const st2 = await connected();
    // the intro plays again on every open; a press anywhere must end it and put the lens back
    await page.waitForSelector('.pip__pointer', { timeout: 20000 });
    await sleep(1400);
    const midIntro = await hostRect();
    await page.mouse.click(1000, 400);
    const boxAtPress = await hostRect();
    const gone = await page.waitForSelector('.pip__pointer', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
    await page.evaluate(() => W.broadcast.emit('rqstClose', 'picker'));
    const afterPress = { pointer: !gone, box: await hostRect(), boxAtPress };
    check('intro: plays on every open and a press ends it, lens back in place', !afterPress.pointer && afterPress.box.join() === boxBefore.join(), { midIntro, afterPress, boxBefore });
    await sleep(2500);
    const restored = { inner: await inner(), chip: await chip(), box: await hostRect(), saved: await savedNow(), seam: await seam() };
    check('reopening restores layer, model, altitude, mode and window', st2 === '' && restored.inner.overlay === 'wind' && restored.inner.product === 'icon' && restored.inner.level === '700h' && restored.chip.model === 'ICON' && restored.saved.mode === 'seamless' && restored.box.join() === boxBefore.join() && seamOk(restored.seam), restored);

    // ---------- closing leaves nothing attached: not to the main Windy, and not to the discarded second one
    // Closed with a panel open, as Windy can close a plugin at any moment
    await page.click(optionsButton);
    await page.waitForSelector('.pip__panel');
    // Chrome's debugger tells which script each event listener comes from
    const cdp = await page.context().newCDPSession(page);
    const pluginScripts = new Set();
    cdp.on('Debugger.scriptParsed', e => { if (e.url.startsWith(PLUGIN_URL.split('?')[0])) pluginScripts.add(e.scriptId); });
    await cdp.send('Debugger.enable');
    const pluginListeners = async expression => {
        const { result } = await cdp.send('Runtime.evaluate', { expression });
        const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: true });
        return listeners.filter(l => pluginScripts.has(l.scriptId)).map(l => l.type);
    };
    await page.evaluate(() => { window.__lensDoc = document.querySelector('.pip iframe').contentDocument; });
    const allListeners = async () => ({ page: [...(await pluginListeners('window')), ...(await pluginListeners('document'))], lensPage: await pluginListeners('window.__lensDoc') });
    // Control: while the lens is open, its listeners are seen
    const listenersOpen = await allListeners();
    const left = await page.evaluate(async pluginUrl => {
        const KEY = 'windy-plugin-layer-lens';
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const w = document.querySelector('.pip iframe').contentWindow;
        const lens = { store: w.W.store, map: w.W.map.map, doc: w.document };
        // Notes any timer or animation frame asked for by plugin code
        const fromPlugin = [];
        const watchCalls = () => ['requestAnimationFrame', 'setTimeout', 'setInterval'].map(name => {
            const original = window[name];
            window[name] = function (...args) {
                if ((new Error().stack || '').includes(pluginUrl)) fromPlugin.push(name);
                return original.apply(this, args);
            };
            return () => { window[name] = original; };
        });
        // Everything on the main page the lens watched: its classes and styles, the map's box, the window, presses and keys
        const pokeMainPage = async press => {
            const mapBlock = W.map.map.getContainer().parentElement;
            document.body.classList.add('pip-test-poke');
            mapBlock.style.marginLeft = '-1px';
            await wait(100);
            document.body.classList.remove('pip-test-poke');
            mapBlock.style.marginLeft = '';
            window.dispatchEvent(new Event('resize'));
            if (press) document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            await wait(300);
        };
        // Control: while the lens is open, poking the page has its code ask for frames.
        // No press: that would close the panel this closes with.
        let unwatch = watchCalls();
        await pokeMainPage(false);
        unwatch.forEach(u => u());
        const callsWhileOpen = fromPlugin.splice(0).length;

        const panelOpenAtClose = !!document.querySelector('.pip__panel');
        window.__pipApp.$destroy();
        window.__pipNode.remove();
        unwatch = watchCalls();
        await wait(500);
        const saved = localStorage.getItem(KEY);
        localStorage.setItem(KEY, 'SENTINEL');
        const lensTime = lens.store.get('timestamp');
        // Fire, by hand, everything the plugin listened to. None of it may reach plugin code now.
        ['overlay', 'product', 'level', 'availProducts', 'visibleProducts', 'availLevels'].forEach(k => lens.store.emit(k, lens.store.get(k)));
        lens.store.emit('timestamp', lensTime);
        lens.store.emit('radsatTimestamp', lensTime);
        lens.map.fire('move');
        lens.doc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        W.store.set('timestamp', W.store.get('timestamp') + 3 * 3600 * 1000);
        W.map.map.setView([-30, 150], 6, { animate: false });
        await pokeMainPage(true);
        // The side pane slides the map, which the lens followed frame by frame
        W.broadcast.emit('rqstOpen', 'menu');
        await wait(1500);
        W.broadcast.emit('rqstClose', 'menu');
        await wait(1500);
        unwatch.forEach(u => u());
        const out = {
            savedState: localStorage.getItem(KEY) === 'SENTINEL' ? 'untouched' : 'rewritten',
            lensTimeFollowedMain: lens.store.get('timestamp') !== lensTime,
            lensMapFollowedMain: Math.abs(lens.map.getCenter().lat - -30) < 0.01,
            frames: document.querySelectorAll('iframe').length,
            panelOpenAtClose,
            leftOnPage: document.querySelectorAll('.pip, .pip__panel').length,
            callsWhileOpen,
            callsAfterClose: fromPlugin,
        };
        localStorage.setItem(KEY, saved);
        return out;
    }, PLUGIN_URL.split('?')[0]);
    const listenersClosed = await allListeners();
    await cdp.send('Debugger.disable');
    await cdp.detach();
    check('closing removes every listener, on the main Windy and on the discarded second one', left.savedState === 'untouched' && !left.lensTimeFollowedMain && !left.lensMapFollowedMain && left.frames === 0, left);
    check('closing leaves no panel, event listener, timer or frame of the plugin behind', left.panelOpenAtClose && left.leftOnPage === 0 && left.callsAfterClose.length === 0 && listenersClosed.page.length === 0 && listenersClosed.lensPage.length === 0 && left.callsWhileOpen > 0 && listenersOpen.page.length > 0 && listenersOpen.lensPage.length > 0, { listenersOpen, listenersClosed, callsWhileOpen: left.callsWhileOpen, callsAfterClose: left.callsAfterClose, panelOpenAtClose: left.panelOpenAtClose, leftOnPage: left.leftOnPage });
    await sleep(800);

    const lsAfter = await settingsSnapshot();
    const attribution = await page.evaluate(([b, a]) => {
        const before = new Map(JSON.parse(b)), after = new Map(JSON.parse(a));
        const changed = [...new Set([...before.keys(), ...after.keys()])].filter(k => before.get(k) !== after.get(k));
        return { changed, notByMain: changed.filter(k => !window.__mainWrites.has(k)) };
    }, [lsBefore, lsAfter]);
    check('no shared setting was changed by the PIP during the whole session', attribution.notByMain.length === 0, attribution);

    console.log('INFO  page errors:', JSON.stringify(errors.slice(0, 6)));
    await browser.close();
    const failed = results.filter(r => !r).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
})().catch(e => {
    console.error('E2E CRASHED', String(e && e.stack || e).slice(0, 1800));
    process.exit(2);
});
