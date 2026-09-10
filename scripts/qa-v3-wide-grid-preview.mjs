import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'output/v3-occupied-grid-20260911');
await fs.mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.QA_CHROMIUM ? {executablePath: process.env.QA_CHROMIUM} : {}),
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']});
const results = [], errors = [], warnings = [];
try {
  for (const [width, height] of [[390, 844], [320, 740], [1366, 900], [1600, 1050]]) {
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
    const dock = () => page.evaluate(() => [...document.getElementById('battle-frame').contentDocument.querySelectorAll('[data-v3-roster-card]')].map(e => {
      const r = e.getBoundingClientRect(); return {id: e.dataset.v3RosterCard, x: r.x, y: r.y, width: r.width, height: r.height};
    }));
    const baseline = async scenario => {
      const wide = await diag(), wideDock = await dock();
      assert.equal(wide.layout.tiles.length, scenario === 'PVP' ? 12 : 10);
      assert.equal(wide.layout.mercenaries.length, scenario === 'PVP' ? 2 : 1);
      assert.equal(wide.bridge.canvasCount, 1);
      assert.equal(wide.bridge.cards, scenario === 'PVP' ? 10 : 5);
      if (scenario === 'PVP') assert.equal(wide.layout.support, null);
      else assert.ok(Math.abs(wide.layout.support.x - (width <= 390 ? 311 : 410)) < 1e-6);
      await page.evaluate(() => WideGridPreview.selectMode('original'));
      const original = await diag();
      assert.equal(original.layout.tiles.length, 42);
      assert.equal(original.layout.mercenaries.length, 0);
      assert.deepEqual(original.layout.actors.map(a => a.scale), wide.layout.actors.map(a => a.scale));
      assert.equal(original.layout.support?.scale, wide.layout.support?.scale);
      assert.equal(original.layout.rootScale, wide.layout.rootScale);
      assert.deepEqual(await dock(), wideDock);
      assert.equal(original.snapshotDigest, wide.snapshotDigest);
      await page.evaluate(() => WideGridPreview.selectMode('wide'));
      assert.deepEqual((await diag()).layout.actors, wide.layout.actors);
      await page.screenshot({path: path.join(output, `${scenario.toLowerCase()}-${width}.png`), fullPage: true});
      results.push({width, height, scenario, tiles: wide.layout.tiles.length, mercenaries: wide.layout.mercenaries.length,
        support: wide.layout.support, scalePreserved: true, dockPreserved: true, snapshotDigest: wide.snapshotDigest});
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
    if (width === 1600) {
      await page.click('#start');
      await page.waitForFunction(() => WideGridPreview.diagnostics().bridge.engine.scrapyard.events > 3);
      assert.equal(await page.locator('[data-scenario="PVP"]').isDisabled(), true);
      await page.click('#pause');
      await page.waitForFunction(() => WideGridPreview.diagnostics().bridge.paused, null, {timeout: 30000});
      await page.click('#reset');
      await page.waitForFunction(() => WideGridPreview.diagnostics().ready && !WideGridPreview.diagnostics().busy);
      assert.equal((await diag()).layout.tiles.length, 10);
      assert.equal((await diag()).bridge.canvasCount, 1);
      await page.click('#start');
      // Let the parent process report progress during this full shared-clock replay.
      console.log('Desktop playback started; checking ten generations and central suit targets.');
      await page.waitForFunction(() => WideGridPreview.diagnostics().ended || document.getElementById('state').textContent === '오류', null, {timeout: 240000});
      const final = await diag();
      assert.equal(final.ended, true);
      assert.equal(final.bridge.engine.scrapyard.defeated, 10);
      assert.equal(final.bridge.engine.accountBattleUnit.sustainedFire.queuedDamageEvents, 0);
      results.push({playback: 'normal-clock', defeated: 10, pausedReset: true, canvasCount: final.bridge.canvasCount,
        remainingTiles: final.layout.tiles.length});
    }
    await page.evaluate(() => WideGridPreview.selectScenario('PVP'));
    assert.equal((await diag()).layout.support, null);
    assert.equal((await diag()).layout.tiles.length, 12);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(failed, []);
    await context.close();
    console.log(`${width}x${height}: PVP/PVE placement, empty slots, baseline scale, dock and reset passed.`);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'qa.json'), JSON.stringify({results, errors, warnings}, null, 2));
  console.log(JSON.stringify({checks: results.length, errors: errors.length, warnings: warnings.length, output}));
} finally {await browser.close();}
