import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const app = read('js/app.js');
const rankedCss = read('css/ranked-v2-v1827.css');
const rankedPreviewCss = read('preview/live-ranked-v2-v1/ranked-v2.css');
const index = read('index.html');
const serviceWorker = read('service-worker.js');

function functionSource(name) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const startMatch = startPattern.exec(app);
  assert.ok(startMatch, `${name} must exist`);

  const start = startMatch.index;
  const nextPattern = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  nextPattern.lastIndex = start + startMatch[0].length;
  const nextMatch = nextPattern.exec(app);
  return app.slice(start, nextMatch?.index ?? app.length);
}

function cssRules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1].split(',').map(selector => selector.trim()),
    declarations: match[2]
  }));
}

function terminalRule(source, terminalSelector, scopeLabel) {
  const rule = cssRules(source).find(candidate => candidate.selectors.some(selector => selector.endsWith(terminalSelector)));
  assert.ok(rule, `${scopeLabel} must explicitly size ${terminalSelector}`);
  return rule.declarations;
}

function assertShrinkableGridItem(declarations, label, { requireMinZero = true } = {}) {
  if (requireMinZero) {
    assert.match(declarations, /min-(?:width|inline-size)\s*:\s*0(?:\D|$)/i, `${label} must be allowed to shrink inside its grid track`);
  }
  assert.doesNotMatch(declarations, /min-(?:width|inline-size)\s*:\s*[1-9]\d*(?:\.\d+)?px/i, `${label} must not impose a fixed positive minimum width`);
  assert.match(declarations, /(?:^|;)\s*(?:width|inline-size)\s*:\s*100%/i, `${label} must size itself from its grid track`);
  assert.doesNotMatch(declarations, /(?:^|;)\s*(?:width|inline-size)\s*:\s*[1-9]\d*(?:\.\d+)?px/i, `${label} must not force a pixel width wider than its grid track`);
  assert.doesNotMatch(declarations, /margin(?:-(?:left|right|inline|inline-start|inline-end))?\s*:\s*-[1-9]/i, `${label} must not escape its grid track with a negative margin`);
}

function desktopCssSection(source, rootSelector, scopeLabel) {
  const start = source.indexOf(rootSelector);
  const end = source.indexOf('@media', start);
  assert.ok(start >= 0, `${scopeLabel} root selector must exist`);
  assert.ok(end > start, `${scopeLabel} desktop rules must appear before responsive overrides`);
  return source.slice(start, end);
}

test('V1907 deck starts with presets, removes the duplicate overview and collapses power details', () => {
  const render = functionSource('renderPvpDeckTab');
  const rootAt = render.indexOf('class="ranked-deck-builder-v1907');
  const presetAt = render.indexOf('class="ranked-preset-command"');
  const consoleAt = render.indexOf('class="ranked-deck-console');
  const inventoryAt = render.indexOf('class="ranked-inventory-console"');
  const detailsAt = render.indexOf('<details class="ranked-power-details');
  const summaryAt = render.indexOf('전투력 상세', detailsAt);
  const breakdownAt = render.indexOf('class="ranked-deck-breakdown', detailsAt);

  assert.ok(rootAt >= 0, 'V1907 deck root must be rendered');
  assert.ok(presetAt > rootAt, 'top preset command must be the first deck workflow');
  assert.ok(consoleAt > presetAt, 'formation console must follow the preset command');
  assert.ok(inventoryAt > consoleAt, 'owned-card inventory must follow the formation console');
  assert.doesNotMatch(render, /ranked-deck-overview|ranked-deck-status-rail/, 'the duplicate deck overview/status rail must be removed');
  assert.ok(detailsAt > consoleAt, 'combat power breakdown must use a native details disclosure');
  assert.ok(summaryAt > detailsAt, 'power disclosure must have a visible 전투력 상세 summary');
  assert.ok(breakdownAt > summaryAt, 'power metrics must remain inside the details disclosure');

  for (const id of ['restorePvpDeck', 'resetPvpDeck', 'savePvpDeck']) {
    assert.ok(render.includes(`id="${id}"`), `${id} must live in the top preset command`);
  }

  assert.match(render, /pvpDeckHasUnsavedChanges\(\)\s*&&\s*!confirm\(/, 'switching presets must protect an unsaved draft');
  assert.match(render, /저장하지 않은 편성/, 'dirty-draft confirmation must explain what will be discarded');
  assert.doesNotMatch(render, /class="[^"]*\bpvp-deck-save\b/, 'legacy bottom save container must not return');
});

test('V1907 match is one centered hero and ranked navigation precedes dynamic content', () => {
  const match = functionSource('rankedLiveMatchHtml');
  const rootAt = match.indexOf('ranked-match-v1907');
  const heroAt = match.indexOf('ranked-match-hero', rootAt);
  const radarAt = match.indexOf('ranked-match-radar', heroAt);
  const statusAt = match.indexOf('ranked-match-status', heroAt);
  const ctaAt = match.indexOf('ranked-match-cta', heroAt);

  assert.ok(rootAt >= 0, 'match renderer must expose the V1907 root');
  assert.ok(heroAt > rootAt, 'V1907 match must have a central hero surface');
  assert.ok(radarAt > heroAt, 'the match radar must live inside the hero');
  assert.ok(statusAt > heroAt, 'match readiness/status must live inside the hero');
  assert.ok(ctaAt > heroAt, 'the primary match CTA must live inside the hero');
  assert.match(match, /id="rankedMatchStart"/, 'the existing functional match-start hook must remain intact');
  assert.doesNotMatch(match, /ranked-tactical-panel|ranked-deck-panel/, 'the old split tactical sidebar must not return');

  const view = functionSource('pvpView');
  const navAt = view.indexOf('<nav class="pvp-tabs ranked-live-tabs"');
  const contentAt = view.indexOf('<section id="pvpContent"');
  assert.ok(navAt >= 0, 'ranked tab navigation must exist');
  assert.ok(contentAt > navAt, 'ranked navigation must precede dynamic content in DOM order');
});

test('ranked deck slots follow the server formation instead of a fixed 2/3 split', () => {
  const slots = functionSource('renderPvpDeckSlots');

  assert.match(slots, /rules\s*=\s*normalizeDeckRules\(pvpState\.deckRules\)[\s\S]*front\s*=\s*rules\.formation\.front/, 'slot renderer must read the normalized server front-line count');
  assert.match(slots, /(?:row|position)\s*=\s*i\s*<\s*front/, 'front/back slot styling must use the server-provided boundary');
  assert.doesNotMatch(slots, /i\s*<\s*2/, 'hard-coded two-card front line must not return');
});

test('inactive healer guidance is hidden until a real penalty applies', () => {
  const healer = functionSource('renderPvpHealerPenalty');
  const v1907Start = rankedCss.indexOf('.ranked-deck-builder-v1907');
  const v1907Css = v1907Start >= 0 ? rankedCss.slice(v1907Start) : '';
  const hiddenByRenderer = /box\.hidden\s*=\s*!state\.reduction/.test(healer)
    || /toggleAttribute\(\s*['"]hidden['"]\s*,\s*!state\.reduction/.test(healer);
  const hiddenByCss = /\.pvp-healer-penalty(?::not\(\.active\)|\[hidden\])\s*\{[^}]*display\s*:\s*none/i.test(v1907Css);

  assert.ok(hiddenByRenderer || hiddenByCss, 'zero-penalty healer guidance must not occupy deck space');
  assert.match(healer, /state\.reduction/, 'active healer penalties must still be rendered from normalized rules');
});

test('server presets stay account-scoped and dirty drafts are really discarded on tab exit', () => {
  const load = functionSource('loadPvpView');

  assert.match(load, /incomingPresets\s*=\s*\{1:\[\.\.\.\(d\.presets/, 'every PVP entry must hydrate presets from the current account response');
  assert.match(load, /pvpState\.presets\s*=\s*incomingPresets/, 'stale presets from a previous account must be replaced');
  assert.match(load, /pvpState\.presetsLoaded\s*=\s*true/, 'the hydrated server snapshot must become the preset baseline');
  assert.match(load, /pvpDeckHasUnsavedChanges\(\)[\s\S]*confirm\('저장하지 않은 편성이 있습니다/, 'leaving the editor must ask before dropping a dirty draft');
  assert.match(load, /pvpState\.deck\s*=\s*\[\.\.\.\(pvpState\.presets\?\.\[selected\]\|\|\[\]\)\]/, 'confirming tab exit must restore the saved preset instead of retaining the dirty draft');
});

test('preset saving is idempotent, snapshot-based and non-blocking', () => {
  const save = functionSource('savePvpDeck');

  assert.match(save, /if\(pvpState\.saving\)return/, 'repeat save clicks must be ignored while the first request is pending');
  assert.match(save, /snapshot\s*=\s*\[\.\.\.pvpState\.deck\]/, 'the request must persist an immutable deck snapshot');
  assert.match(save, /cardIds\s*:\s*snapshot\s*,\s*presetNo/, 'the selected preset number and exact draft snapshot must be posted together');
  assert.match(save, /pvpState\.saving\s*=\s*true[\s\S]*pvpState\.saving\s*=\s*false/, 'the visible saving state must bracket the server request');
  assert.match(save, /showPvpDeckNotice\(/, 'save feedback must use the non-blocking command-room notice');
  assert.doesNotMatch(save, /\balert\s*\(/, 'blocking browser alerts must not return to the save workflow');
});

test('desktop deck cards cannot escape their grid tracks in runtime or preview CSS', () => {
  const runtimeDesktop = desktopCssSection(rankedCss, '.ranked-deck-builder-v1907', 'runtime V1907 deck');

  const runtimeGrid = terminalRule(runtimeDesktop, '.pvp-deck-slots', 'runtime desktop deck');
  assert.match(runtimeGrid, /grid-template-columns\s*:\s*repeat\(\s*5\s*,\s*minmax\(/i, 'runtime desktop deck must reserve five explicit grid tracks');
  assertShrinkableGridItem(
    terminalRule(runtimeDesktop, '.pvp-deck-slots>.pvp-deck-slot', 'runtime desktop deck'),
    'runtime deck slot'
  );
  assertShrinkableGridItem(
    terminalRule(runtimeDesktop, '.pvp-card-mini-full', 'runtime desktop deck'),
    'runtime card wrapper'
  );
  assertShrinkableGridItem(
    terminalRule(runtimeDesktop, '.pvp-card-mini-full>.card-frame', 'runtime desktop deck'),
    'runtime card frame',
    { requireMinZero: false }
  );

  const previewStart = rankedPreviewCss.indexOf('.ranked-deck-renewal');
  const previewEnd = rankedPreviewCss.indexOf('@media (max-width: 1180px)', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'preview V1905 desktop CSS section must be bounded before responsive overrides');
  const previewDesktop = rankedPreviewCss.slice(previewStart, previewEnd);

  const previewGrid = terminalRule(previewDesktop, '.renewed-deck-roster', 'preview desktop deck');
  assert.match(previewGrid, /grid-template-columns\s*:\s*repeat\(\s*5\s*,\s*minmax\(/i, 'preview desktop deck must reserve five explicit grid tracks');
  assertShrinkableGridItem(
    terminalRule(previewDesktop, '.renewed-deck-slot', 'preview desktop deck'),
    'preview deck slot'
  );
  assertShrinkableGridItem(
    terminalRule(previewDesktop, '.renewed-deck-slot .card-frame', 'preview desktop deck'),
    'preview card frame',
    { requireMinZero: false }
  );
});

test('V1907 match CSS uses circular motion with an explicit reduced-motion fallback', () => {
  const scopeStart = rankedCss.indexOf('.ranked-match-v1907');
  assert.ok(scopeStart >= 0, 'V1907 match CSS scope must exist');
  const v1907 = rankedCss.slice(scopeStart);

  const hero = terminalRule(v1907, '.ranked-match-hero', 'V1907 match');
  const radar = terminalRule(v1907, '.ranked-match-radar', 'V1907 match');
  assert.match(hero, /(?:place-items|justify-items|text-align)\s*:\s*center/i, 'match hero must center the core interaction');
  assert.match(radar, /border-radius\s*:\s*50%/i, 'radar must use a true circular surface');
  assert.match(radar, /animation\s*:/i, 'radar must carry visible live-system motion');

  const keyframes = [...v1907.matchAll(/@keyframes\s+(ranked-v1907-[\w-]+)/gi)].map(match => match[1]);
  assert.ok(keyframes.length >= 2, 'V1907 must define at least two scoped radar/status motion keyframes');

  const reducedAt = v1907.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i);
  assert.ok(reducedAt >= 0, 'V1907 motion must include a reduced-motion media query');
  const reduced = v1907.slice(reducedAt);
  assert.ok(reduced.includes('.ranked-match-v1907'), 'reduced-motion override must target the V1907 match');
  assert.match(reduced, /animation(?:-duration)?\s*:\s*(?:none|\.0?1ms)/i, 'reduced-motion mode must disable or effectively stop animation');

  assert.doesNotMatch(v1907, /clip-path\s*:/i, 'V1907 must not use clipped diamond-like surfaces');
  assert.doesNotMatch(v1907, /rotate(?:Z)?\(\s*45deg\s*\)/i, 'V1907 must not rotate squares into diamonds');
  assert.doesNotMatch(v1907, /[◆◇★☆✦✧]/, 'V1907 must not add diamond or star ornaments');
});

test('V1907 ranked deck CSS keeps a rectangular, responsive command-console contract', () => {
  const scopeStart = rankedCss.indexOf('.ranked-deck-builder-v1907');
  assert.ok(scopeStart >= 0, 'V1907 ranked deck CSS scope must exist');
  const v1907 = rankedCss.slice(scopeStart);

  for (const selector of [
    '.ranked-deck-builder-v1907',
    '.ranked-preset-command',
    '.ranked-preset-grid',
    '.ranked-deck-console',
    '.ranked-inventory-console',
    '.ranked-power-details',
    '.ranked-deck-breakdown'
  ]) assert.ok(v1907.includes(selector), `missing V1907 selector: ${selector}`);

  assert.ok(!v1907.includes('.ranked-deck-overview'), 'removed overview CSS must not be copied into V1907');

  assert.match(v1907, /\.ranked-preset-command\s*\{[^}]*position\s*:\s*sticky/i, 'preset controls must remain available at the top while editing');

  const responsiveAt = v1907.search(/@media\s*\(\s*max-width\s*:\s*\d+px\s*\)/i);
  assert.ok(responsiveAt >= 0, 'V1907 styles must include a compact viewport contract');
  const responsive = v1907.slice(responsiveAt);
  const railMatch = responsive.match(/\.ranked-deck-builder-v1907\s+\.pvp-deck-slots\s*\{([^}]*)\}/i);
  assert.ok(railMatch, 'compact V1907 styles must define the five-slot rail');
  const rail = railMatch[1];
  assert.match(rail, /overflow-x\s*:\s*auto/i, 'compact deck slots must scroll horizontally');

  const trackMatch = rail.match(/(?:grid-template-columns|grid-auto-columns)\s*:\s*([^;]+)/i);
  assert.ok(trackMatch, 'compact deck slots must define fixed card tracks');
  const trackSizes = [...trackMatch[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  assert.ok(trackSizes.some(size => size >= 118 && size <= 132), 'compact card tracks must stay between 118px and 132px');
  assert.ok(/repeat\(\s*5\s*,/i.test(trackMatch[1]) || /grid-auto-flow\s*:\s*column/i.test(rail), 'all five slots must remain on one horizontal rail');

  assert.doesNotMatch(v1907, /clip-path\s*:/i, 'V1907 must not use clipped diamond-like surfaces');
  assert.doesNotMatch(v1907, /rotate(?:Z)?\(\s*45deg\s*\)/i, 'V1907 must not rotate squares into diamonds');
  assert.doesNotMatch(v1907, /[◆◇★☆✦✧]/, 'V1907 must not add diamond or star ornaments');
});

test('ranked V1907 assets share one cache-bust version', () => {
  const cssVersion = index.match(/css\/ranked-v2-v1827\.css\?v=(1908-[^"']+)/)?.[1];
  const appVersion = index.match(/js\/app\.js\?v=(1908-[^"']+)/)?.[1];
  assert.ok(cssVersion, 'ranked V1907 stylesheet must be cache-busted');
  assert.equal(appVersion, cssVersion, 'ranked CSS and application bundle must share one V1907 cache version');
  assert.ok(serviceWorker.includes(`soop-card-shell-v${cssVersion}`), 'service worker shell cache must advance with the V1907 renewal');
});
