import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createWebOverrides} from '../scripts/onestore/web-overrides.mjs';
import {startCodexUiServer} from './helpers/mercenary-codex-ui-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagedRoot = process.env.ONESTORE_PACKAGED_WEB_ROOT;
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const apkScripts = ['/js/adventure-lobby-v2107.js', '/js/soopketmon-v21-exact-shell-adapter.js', '/js/store-distribution-v1.js'];
const packaged = packagedRoot
  ? new Map(await Promise.all(apkScripts.map(async key => [key, await readFile(join(packagedRoot, key))])))
  : (await createWebOverrides(root)).overrides;

const server = await startCodexUiServer();
server.fixture.account.loadouts.PVE = {mercenaryCode: null, mercenaryCodes: [], revision: 1};
const browser = await chromium.launch({channel: 'chrome', headless: true});
const mobileUA = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/137.0.0.0 Mobile Safari/537.36';
const formation = server.origin + '/mercenary-codex/';

async function checkFormation(page) {
  const menu = page.locator('soop-adventure-lobby');
  await menu.locator('.mobile-dock').waitFor();
  assert.equal(await menu.getAttribute('data-route'), 'mercenaryDex');
  assert.equal(await menu.getAttribute('data-view'), 'route');
  assert.equal(await menu.locator('#hero').isVisible(), false);
  await page.locator('[data-select-mode="PVP"]').tap();
  await page.locator('[data-code="V-013"]').tap();
  await page.locator('#inspectionSheet[open]').waitFor();
  await page.locator('#closeInspection').tap();
}

try {
  for (const native of [true, false]) {
    const context = await browser.newContext({
      viewport: {width: 360, height: 704}, isMobile: true, hasTouch: true, serviceWorkers: 'block',
      userAgent: mobileUA + (native ? ' ReverseCallAndroid/1.0.3 ReverseCallStore/onestore/1.0.3' : ''),
    });
    const errors = [];
    let policyRequests = 0;
    try {
      await context.addInitScript(() => {
        localStorage.setItem('cnine_card_api_token', 'fixture-token');
        localStorage.setItem('cnine_player_client_id_v1552', 'fixture-client');
        localStorage.setItem('cnine_card_user_v10', JSON.stringify({id: 7, serverUserId: 7, nickname: '검수'}));
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== server.origin) return route.abort();
        if (url.pathname === '/js/store-distribution-v1.js') policyRequests++;
        if (native && apkScripts.includes(url.pathname))
          return route.fulfill({contentType: 'text/javascript', body: packaged.get(url.pathname)});
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(formation);
      await checkFormation(page);
      if (native) {
        assert.equal(await page.evaluate(() => window.CNineStorePolicy.allowsRoute('seasonPass')), false);
        await page.locator('[data-select-mode="PVE"]').tap();
        await page.locator('[data-code="V-021"]').tap();
        await page.locator('.deployment-controls > summary').tap();
        await page.locator('[data-equip="V-021"][data-deploy-mode="PVE"][data-deploy-slot="0"]').tap();
        await page.waitForFunction(() => document.querySelector('[data-current-mode="PVE"] strong')?.textContent.includes('오메가-X'));
        await page.locator('#closeInspection').tap();
        assert.equal(server.fixture.account.loadouts.PVE.mercenaryCodes[0], 'V-021');
        assert.equal(server.fixture.account.loadouts.PVP.mercenaryCodes[0], 'V-001');
        const menu = page.locator('soop-adventure-lobby');
        await menu.locator('.mobile-dock [data-category="all"]').tap();
        await menu.locator('#menu-dialog[open]').waitFor();
        await menu.locator('#menu-search').fill('용병');
        await Promise.all([
          page.waitForEvent('domcontentloaded'),
          menu.locator('.menu-result[data-route="mercenaryDex"]').first().tap(),
        ]);
        await checkFormation(page);
        await page.reload();
        await checkFormation(page);
        assert.equal(policyRequests, 3);
      } else {
        assert.equal(policyRequests, 0);
        assert.equal(await page.evaluate(() => typeof window.CNineStorePolicy), 'undefined');
      }
      assert.deepEqual(errors, []);
      console.log(native ? 'ONE store direct entry, PVE save, PVP details, menu re-entry and reload passed.' : 'Ordinary mobile web direct entry and PVP details passed.');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
