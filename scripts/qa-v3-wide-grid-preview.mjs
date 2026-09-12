import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {stationPoint, FORMATION_LATTICES} from '../preview/v3-wide-grid-v1/source/grid-layout.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'output/v3-viewport-fit-20260911');
await fs.mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.QA_CHROMIUM ? {executablePath: process.env.QA_CHROMIUM} : {}),
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']});
const results = [], errors = [], warnings = [];
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < .02, `${label}: ${a} != ${b}`);
const save = () => fs.writeFile(path.join(output, 'qa.json'), JSON.stringify({results, errors, warnings}, null, 2));
try {
  for (const [width, height] of [[390, 844], [320, 740], [576, 720], [760, 900], [988, 800], [1366, 900], [1600, 1050]]) {
    if (process.env.QA_WIDTH && width !== Number(process.env.QA_WIDTH)) continue;
    const context = await browser.newContext({viewport: {width, height}, isMobile: width <= 390, hasTouch: width <= 390});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({width, message: error.message}));
    page.on('console', message => {if (message.type() === 'warning') warnings.push({width, message: message.text()});});
    const failed = [];
    page.on('response', response => {if (response.status() >= 400) failed.push({status: response.status(), url: response.url()});});
    await page.goto(`${process.env.QA_BASE_URL || 'http://127.0.0.1:8791'}/preview/v3-wide-grid-v1/?scenario=PVP`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.WideGridPreview?.diagnostics().ready, null, {timeout: 45000});
    const diag = () => page.evaluate(() => WideGridPreview.diagnostics());
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = () => page.evaluate(() => document.getElementById('battle-frame').contentWindow.WideGridLayout.geometry());
    const dock = () => page.evaluate(() => [...document.getElementById('battle-frame').contentDocument.querySelectorAll('[data-v3-roster-card]')].map(e => {
      const r = e.getBoundingClientRect(); return {id: e.dataset.v3RosterCard, x: r.x, y: r.y, width: r.width, height: r.height};
    }));
    const baseline = async scenario => {
      await settle();
      const wide = await diag(), wideDock = await dock();
      assert.equal(wide.layout.tiles.length, scenario === 'PVP' ? 12 : 10);
      assert.equal(wide.layout.mercenaries.length, scenario === 'PVP' ? 2 : 1);
      assert.equal(wide.bridge.canvasCount, 1);
      assert.equal(wide.bridge.cards, scenario === 'PVP' ? 10 : 5);
      if (scenario === 'PVP') assert.equal(wide.layout.support, null);
      else if (!wide.layout.viewportFit) close(wide.layout.support.x, stationPoint('support').x);
      assert.equal(wide.layout.layoutVersion, 'UNIFORM_LATTICE_V2');
      for (const actor of wide.layout.actors) close(actor.scale, wide.layout.viewportFit ? .65 : .5, 'uniform actor scale');
      const before = await geometry();
      if (before.fit) {
        close(before.fit.scale, (before.width - 24) / FORMATION_LATTICES.compact.width, 'content fills available width');
        close(wide.layout.scene.width * wide.layout.rootScale, before.width, 'background width');
        close(wide.layout.scene.height * wide.layout.rootScale, before.height, 'background height');
        const {available} = before.fit, bottom = available.top + available.height;
        const rects = [...before.actors.flatMap(a => [a.body, a.hud]), ...before.mercenaries.map(a => a.all), ...(before.support ? [before.support.all] : [])];
        for (const r of rects) {
          assert.ok(r.x >= -1 && r.x + r.width <= before.width + 1, `clipped horizontally: ${JSON.stringify(r)}`);
          assert.ok(r.y >= available.top - 1 && r.y + r.height < bottom + 1, `covered by header/dock: ${JSON.stringify(r)}`);
        }
        // A taller or shorter outer window must not shrink actors or spread their feet.
        for (const nextHeight of [height + 420, Math.max(480, height - 200), height]) {
          await page.setViewportSize({width, height: nextHeight}); await settle();
          const after = await diag(), fitted = await geometry();
          close(fitted.height, before.height, 'content height ignores outer aspect');
          close(after.layout.rootScale, wide.layout.rootScale, 'same width/same scale');
          for (const [i, actor] of after.layout.actors.entries()) {
            close(actor.x, wide.layout.actors[i].x); close(actor.y, wide.layout.actors[i].y); close(actor.scale, wide.layout.actors[i].scale);
          }
        }
      } else {
        assert.ok(before.width > 760);
        for (const team of ['ALLY', 'ENEMY']) for (const [i, actor] of wide.layout.actors.filter(a => a.team === team).entries()) {
          const approved = stationPoint('cards', i, team);
          close(actor.x, approved.x, 'approved PC X'); close(actor.y, approved.y, 'approved PC Y');
        }
      }
      await page.evaluate(() => WideGridPreview.selectMode('original'));
      await settle();
      const original = await diag();
      assert.equal(original.layout.tiles.length, 42);
      assert.equal(original.layout.mercenaries.length, 0);
      if (!wide.layout.viewportFit) assert.equal(original.layout.rootScale, wide.layout.rootScale);
      assert.deepEqual(await dock(), wideDock);
      assert.equal(original.snapshotDigest, wide.snapshotDigest);
      await page.evaluate(() => WideGridPreview.selectMode('wide'));
      await settle();
      assert.deepEqual((await diag()).layout.actors, wide.layout.actors);
      await page.screenshot({path: path.join(output, `${scenario.toLowerCase()}-${width}.png`), fullPage: true});
      results.push({width, height, scenario, tiles: wide.layout.tiles.length, mercenaries: wide.layout.mercenaries.length,
        support: wide.layout.support, compact: Boolean(before.fit), heightIndependent: Boolean(before.fit),
        uniformStations: true, dockPreserved: true, snapshotDigest: wide.snapshotDigest, geometry: before});
      await save();
    };
    await baseline('PVP');
    await page.selectOption('#ally-mercenaries', '0');
    assert.equal((await diag()).layout.tiles.length, 11);
    await page.selectOption('#enemy-mercenaries', '0');
    assert.equal((await diag()).layout.tiles.length, 10);
    const rejected = await page.evaluate(() => {try {document.getElementById('battle-frame').contentWindow.WideGridLayout.setMercenaries(2, 1);return false;} catch {return true;}});
    assert.equal(rejected, true);
    await page.selectOption('#ally-mercenaries', '1');
    await page.selectOption('#enemy-mercenaries', '1');
    await page.evaluate(() => WideGridPreview.selectScenario('PVE'));
    await baseline('PVE');
    if (width === 390) {
      const beforeFullscreen = await diag();
      await page.click('#fullscreen');
      await page.waitForFunction(() => Boolean(document.fullscreenElement)); await settle();
      const fullscreen = await diag();
      assert.ok(fullscreen.layout.rootScale >= beforeFullscreen.layout.rootScale);
      assert.deepEqual(fullscreen.layout.actors.map(a => a.scale), beforeFullscreen.layout.actors.map(a => a.scale));
      await page.screenshot({path: path.join(output, 'pve-390-fullscreen.png')});
      await page.evaluate(() => document.exitFullscreen()); await settle();
      close((await diag()).layout.rootScale, beforeFullscreen.layout.rootScale, 'fullscreen restore');
      results.push({width, fullscreen: true, restoresContentFit: true}); await save();
    }
    if (width === Number(process.env.QA_PLAYBACK_WIDTH || 390) && process.env.QA_SKIP_PLAYBACK !== '1') {
      await page.click('#start');
      await page.waitForFunction(() => WideGridPreview.diagnostics().bridge.engine.scrapyard.events > 3);
      assert.equal(await page.locator('[data-scenario="PVP"]').isDisabled(), true);
      await page.click('#pause');
      await page.waitForFunction(() => WideGridPreview.diagnostics().bridge.paused, null, {timeout: 30000});
      // Cross the mobile boundary while paused, then restore before replay.
      await page.setViewportSize({width: 988, height: 720}); await settle();
      assert.equal((await diag()).layout.viewportFit, null);
      await page.setViewportSize({width, height}); await settle();
      await page.click('#reset');
      await page.waitForFunction(() => WideGridPreview.diagnostics().ready && !WideGridPreview.diagnostics().busy);
      assert.equal((await diag()).layout.tiles.length, 10);
      assert.equal((await diag()).bridge.canvasCount, 1);
      await page.click('#start');
      // Let the parent process report progress during this full shared-clock replay.
      console.log(`${width}px playback started; checking ten generations and central suit targets.`);
      await page.waitForFunction(() => WideGridPreview.diagnostics().ended || document.getElementById('state').textContent === '오류', null, {timeout: 240000});
      const final = await diag();
      assert.equal(final.ended, true);
      assert.equal(final.bridge.engine.scrapyard.defeated, 10);
      assert.equal(final.bridge.engine.accountBattleUnit.sustainedFire.queuedDamageEvents, 0);
      results.push({playback: 'normal-clock', defeated: 10, pausedReset: true, canvasCount: final.bridge.canvasCount,
        remainingTiles: final.layout.tiles.length});
      await save();
    }
    await page.evaluate(() => WideGridPreview.selectScenario('PVP'));
    assert.equal((await diag()).layout.support, null);
    assert.equal((await diag()).layout.tiles.length, 12);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(failed, []);
    await context.close();
    console.log(`${width}x${height}: PVP/PVE placement, aspect changes, occupied slots, PC baseline and dock passed.`);
  }
  assert.deepEqual(errors, []);
  await save();
  console.log(JSON.stringify({checks: results.length, errors: errors.length, warnings: warnings.length, output}));
} finally {await browser.close();}
