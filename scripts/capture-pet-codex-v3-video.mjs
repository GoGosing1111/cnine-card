import {chromium} from 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out='docs/qa/pet-rework-20261114/unified',browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:out,size:{width:1280,height:900}}}),page=await context.newPage();
await page.goto('http://127.0.0.1:18874/pet-codex/');
await page.locator('[data-pg-action="roll"][data-kind="stats"]:not([disabled])').waitFor();
await page.locator('.pg-stats-pane').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
await page.locator('[data-pg-action="roll"][data-kind="stats"]').click();await page.locator('[data-pg-action="apply"]').waitFor();await page.waitForTimeout(600);
await page.locator('[data-pg-action="keep"]').click();await page.locator('[data-pg-action="roll"][data-kind="trait"]:not([disabled])').waitFor();await page.locator('[data-pg-action="roll"][data-kind="trait"]').click();await page.locator('[data-pg-action="apply"]').waitFor();await page.waitForTimeout(700);
const video=page.video();await context.close();await video.saveAs(out+'/dice-roll-review.webm');await browser.close();console.log(out+'/dice-roll-review.webm');

