import {EXPANSION_CHAPTERS, EXPANSION_SCENES, EXPANSION_ART, EXPANSION_CHARACTERS} from './expansion.js?v=20261018-v1';

export const STORY_VERSION = 1;
export const ASSET_ROOT = '/assets/ui/reverse-call/world-story-v1/';

export const CHAPTERS = Object.freeze([
  { id: 'rewritten-world', label: 'PROLOGUE', title: '수정된 세계', description: '우리가 잃어버렸다는 사실조차 잊은 것들.', start: 'rewrite', art: 'city' },
  { id: 'first-signal', label: 'CHAPTER 01', title: '먼저 도착한 목소리', description: '끊어진 주파수 너머에서 들려온 구조 요청.', start: 'radio', art: 'signal' },
  { id: 'unmapped-station', label: 'CHAPTER 02', title: '지도에 없는 역', description: '존재하지 않는 장소에서 시작되는 첫 의뢰.', start: 'station', art: 'station' },
  ...EXPANSION_CHAPTERS
]);

export const SCENES = Object.freeze([
  { id: 'rewrite', chapter: 0, art: 'city', position: '58% 46%', location: '기록되지 않은 과거', title: '세계는 한 번 수정되었다.', paragraphs: [
    '인류는 모든 것이 끝나는 순간에 도달했다. 누군가는 재앙을 막기 위해 역사를 고쳤고, 세상은 다시 아침을 맞았다.',
    '사람들은 평범한 하루를 살아갔다. 어제까지 다른 미래가 있었다는 사실을 아는 사람은 없었다.'
  ] },
  { id: 'erased', chapter: 0, art: 'city', position: '64% 42%', location: '사라진 역사의 흔적', title: '구원에는 빈자리가 남았다.', paragraphs: [
    '수정된 역사에서 도시들이 지워졌다. 그곳에서 살던 사람들, 그들이 사랑했던 이름들, 돌아가야 할 집까지.',
    '누군가를 잃었다는 기억조차 사라졌다. 남겨진 세계는 그 빈자리를 알아보지 못했다.'
  ] },
  { id: 'reverse-call', chapter: 0, art: 'signal', position: '50% 48%', location: '현재 · 첫 번째 신호', title: '그리고, 호출이 돌아왔다.', paragraphs: [
    '전원이 끊긴 통신기에서 목소리가 흘러나왔다. 폐쇄된 역에서는 열차 안내방송이 울렸다. 이름 없는 카드가 낯선 장소를 비추었다.',
    '사라진 세계가 현재에 접촉하는 현상. 사람들은 그것을 리버스콜이라 불렀다.'
  ] },
  { id: 'radio', chapter: 1, art: 'signal', position: '50% 50%', location: '폐쇄된 철도 관제실', title: '“거기, 누구 있나요?”', paragraphs: [
    '먼지 쌓인 무전기는 몇 번이나 같은 말을 반복했다. 곁을 지나던 사람들은 아무 소리도 듣지 못했다.',
    '당신에게만 그 목소리가 들렸다. 손을 뻗자, 잡음 사이로 누군가 안도의 숨을 내쉬었다.',
    '“드디어… 닿았네요.”'
  ] },
  { id: 'trace', chapter: 1, art: 'signal', position: '48% 58%', location: '연결을 붙잡는 것', title: '존재했다는 작은 증거.', paragraphs: [
    '책상 위에는 주인을 알 수 없는 카드 한 장이 놓여 있었다. 카드를 집어 들자 끊기던 목소리가 선명해졌다.',
    '이름, 유품, 누군가 남긴 기록. 사라진 존재의 흔적은 두 세계를 잇는 연결점이 되었다.',
    '당신은 그 연결을 놓치지 않을 수 있었다.'
  ] },
  { id: 'request', chapter: 1, art: 'city', position: '52% 52%', location: '첫 번째 의뢰', title: '동생을 찾아주세요.', paragraphs: [
    '의뢰인은 낡은 승차권을 내밀었다. 동생이 마지막으로 향한 곳은 수십 년 전에 폐쇄된 역이라고 했다.',
    '당신은 주소를 찾았다. 도시의 어느 지도에도 그 역은 없었다.',
    '하지만 승차권을 쥔 순간, 익숙한 골목 끝에 아래로 내려가는 계단이 보였다.'
  ] },
  { id: 'station', chapter: 2, art: 'station', position: '50% 44%', location: '지도에 없는 역 · 승강장', title: '열차가 곧 도착합니다.', paragraphs: [
    '계단 아래에는 아무도 없는 승강장이 있었다. 먼지 위로 새 발자국이 이어졌고, 벤치에는 아직 온기가 남아 있었다.',
    '멈춘 시계 아래에서 안내방송이 울렸다.',
    '“이번 열차를 놓치지 마세요.”'
  ] },
  { id: 'train', chapter: 2, art: 'arrival', position: '60% 45%', location: '경계에 멈춘 열차', title: '문 너머의 사람.', paragraphs: [
    '불빛도 소리도 없이 열차가 도착했다. 열린 문 너머에는 이 도시와 다른 하늘이 펼쳐져 있었다.',
    '누군가 문턱을 넘지 못한 채 손을 내밀었다. 당신이 승차권을 꺼내자, 서로의 손끝이 처음으로 닿았다.',
    '“누나가… 보냈어요?”'
  ] },
  { id: 'return', chapter: 2, art: 'arrival', position: '54% 48%', location: '돌아오는 길', title: '한 사람을 되찾았다.', paragraphs: [
    '당신은 그 손을 붙잡아 승강장으로 끌어당겼다. 열차 문이 닫히자 벽에 없던 금이 생겼다. 틈 너머로 낯선 도시의 불빛이 새어 나왔다.',
    '두 사람이 지상으로 올라왔을 때, 골목의 계단은 사라져 있었다.',
    '이제 의뢰인에게 돌아가면 되는 일이었다.'
  ] },
  { id: 'no-record', chapter: 2, art: 'signal', position: '50% 46%', location: '첫 번째 의뢰 · 남겨진 기록', title: '그런 사람은 없었습니다.', paragraphs: [
    '약속한 장소에는 아무도 없었다. 의뢰 기록에는 당신의 이름과 구출한 사람의 이름만 남아 있었다.',
    '그의 누나를 기억하는 사람은 없었다. 조금 전까지 함께 있었던 당신만이, 그 얼굴과 목소리를 기억했다.',
    '그때, 카드에서 다시 목소리가 들렸다.',
    '“이번에는, 나를 잊지 말아 주세요.”'
  ] },
  ...EXPANSION_SCENES
]);

export const STORAGE_KEY = 'reverse-call:world-story:v1';
export const CHARACTERS = Object.freeze({
  sister: { name: '의뢰인', image: 'sister.webp', alt: '낡은 승차권을 쥔 긴 갈색 머리의 의뢰인, 회색 코트를 입은 성인 여성 상반신' },
  brother: { name: '실종된 동생', image: 'brother.webp', alt: '안도와 당혹감이 교차하는 표정의 동생, 짙은 여행 재킷을 입은 성인 남성 상반신' },
  ...EXPANSION_CHARACTERS
});
export const SCENE_CHARACTERS = Object.freeze({
  request: { character: 'sister', speaker: '의뢰인' },
  train: { character: 'brother', speaker: '실종된 동생' },
  return: { character: 'brother', speaker: '돌아온 동생' },
  'no-record': { character: 'sister', speaker: '카드 너머의 목소리', echo: true },
  ...Object.fromEntries(EXPANSION_SCENES.filter(scene=>scene.character).map(scene=>[scene.id,{character:scene.character,speaker:scene.speaker,echo:scene.echo}]))
});
export const readingMinutes = Math.max(1, Math.ceil(SCENES.reduce((sum,scene)=>sum+scene.paragraphs.join('').length,0)/430));
export const artUrl = art => EXPANSION_ART[art] || `${ASSET_ROOT}${art}.webp`;
export const portraitUrl = character => character.image.startsWith('/') ? character.image : ASSET_ROOT + character.image;
export function readBookmark(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (value?.version !== STORY_VERSION || typeof value.sceneId !== 'string') return null;
    const index = SCENES.findIndex(scene => scene.id === value.sceneId);
    if (index < 0) return null;
    // A previously completed release resumes at the first newly added scene.
    if (value.completed === true && index < SCENES.length - 1) return {index:index + 1,completed:false};
    return { index, completed: value.completed === true };
  } catch { return null; }
}
export function saveBookmark(storage, index, completed = false) {
  if (!Number.isInteger(index) || !SCENES[index]) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORY_VERSION, sceneId: SCENES[index].id, completed }));
    return true;
  } catch { return false; }
}
export function sceneFromHash(hash) {
  const id = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('scene');
  return SCENES.findIndex(scene => scene.id === id);
}

// Public story data also supports bookmark validation without a browser.
if (typeof document !== 'undefined') {

const byId = id => document.getElementById(id);
const cover = byId('cover');
const reader = byId('reader');
const dialog = byId('chapter-dialog');
const artLayers = [byId('art-a'), byId('art-b')];
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let bookmark = readBookmark(storage);
let current = -1;
let activeLayer = 0;
let activeArt = 'city';
let artRequest = 0;
let touchStart = null;
let dialogOpener = null;
let storageAvailable = !!storage;
const warmed = new Set();

function setAddress(index) {
  const hash = index >= 0 ? `#scene=${encodeURIComponent(SCENES[index].id)}` : '';
  try { history.replaceState(null, '', `${location.pathname}${location.search}${hash}`); } catch { /* Reading also works without history access. */ }
}

function warmArt(index) {
  const portrait = CHARACTERS[SCENE_CHARACTERS[SCENES[index]?.id]?.character];
  if (portrait && !warmed.has(portrait.image)) { warmed.add(portrait.image); const image = new Image(); image.src = portraitUrl(portrait); }
  const art = SCENES[index]?.art;
  if (!art || warmed.has(art)) return;
  warmed.add(art);
  const image = new Image();
  image.src = artUrl(art);
}

function showArt(art, position = '58% 46%', retry = false) {
  const request = ++artRequest;
  byId('art-error').hidden = true;
  if (art === activeArt && !retry && artLayers[activeLayer].naturalWidth > 0) {
    artLayers[activeLayer].style.objectPosition = position;
    return;
  }
  const nextLayer = 1 - activeLayer;
  const image = artLayers[nextLayer];
  image.style.objectPosition = position;
  image.onload = () => {
    if (request !== artRequest) return;
    image.classList.add('is-visible');
    artLayers[activeLayer].classList.remove('is-visible');
    activeLayer = nextLayer;
    activeArt = art;
    byId('art-error').hidden = true;
  };
  image.onerror = () => { if (request === artRequest) byId('art-error').hidden = false; };
  const suffix = retry ? `?retry=${Date.now()}` : '';
  image.src = artUrl(art) + suffix;
}

function updateBookmark(index, completed = false) {
  bookmark = { index, completed };
  storageAvailable = saveBookmark(storage, index, completed);
  updateCover();
}

function updateCover() {
  const resume = byId('resume-story');
  resume.hidden = !bookmark || bookmark.completed;
  if (bookmark) resume.textContent = `이어 읽기 · ${bookmark.index + 1} / ${SCENES.length}`;
  byId('start-story').innerHTML = bookmark?.completed ? '처음부터 다시 읽기 <span aria-hidden="true">↺</span>' : '이야기 시작 <span aria-hidden="true">→</span>';
  byId('reading-note').textContent = bookmark?.completed ? '공개된 이야기를 모두 읽었습니다. 남겨진 호출은 계속됩니다.' : `${CHAPTERS.length}개의 장 · ${SCENES.length}개의 장면 · 약 ${readingMinutes}분`;
  byId('save-note').textContent = storageAvailable ? '읽던 장면은 이 기기에 저장됩니다.' : '이 브라우저에서는 읽던 장면을 저장할 수 없습니다.';
  updateChapterStates();
}

function updateChapterStates() {
  document.querySelectorAll('[data-chapter]').forEach(button => {
    const chapter = Number(button.dataset.chapter);
    const selected = current >= 0 && SCENES[current].chapter === chapter;
    button.setAttribute('aria-current', String(selected));
    button.querySelector('.chapter-state').textContent = selected ? '읽는 중' : bookmark?.completed ? '다시 읽기' : '읽기 →';
  });
}

function showScene(index, { address = true, scroll = true } = {}) {
  if (!Number.isInteger(index) || !SCENES[index]) return;
  current = index;
  const scene = SCENES[index];
  const chapter = CHAPTERS[scene.chapter];
  cover.hidden = true;
  reader.hidden = false;
  document.body.classList.add('is-reading');
  byId('scene-location').textContent = scene.location;
  byId('scene-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(SCENES.length).padStart(2, '0')}`;
  byId('chapter-label').textContent = `${chapter.label} · ${chapter.title}`;
  byId('scene-title').textContent = scene.title;
  const appearance = SCENE_CHARACTERS[scene.id];
  const character = CHARACTERS[appearance?.character];
  byId('story-portrait').hidden = !character;
  byId('speaker-label').hidden = !character;
  byId('story-composition').classList.toggle('has-character', !!character);
  reader.classList.toggle('has-character', !!character);
  if (character) {
    const portrait = byId('character-art');
    portrait.src = portraitUrl(character);
    portrait.alt = character.alt;
    byId('speaker-label').textContent = appearance.speaker;
    byId('story-portrait').classList.toggle('is-echo', appearance.echo === true);
  }
  byId('narrative').replaceChildren(...scene.paragraphs.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
  byId('previous-scene').disabled = index === 0;
  const last = index === SCENES.length - 1;
  byId('next-scene').innerHTML = last ? '이야기 마치기' : SCENES[index + 1].chapter !== scene.chapter ? '다음 장 <span aria-hidden="true">→</span>' : '다음 <span aria-hidden="true">→</span>';
  byId('progress-label').textContent = `${index + 1} / ${SCENES.length}`;
  byId('story-progress').max = SCENES.length;
  byId('story-progress').value = index + 1;
  showArt(scene.art, scene.position);
  updateBookmark(index);
  if (address) setAddress(index);
  warmArt(index + 1);
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

function showCover({ address = true, focus = true } = {}) {
  current = -1;
  cover.hidden = false;
  reader.hidden = true;
  document.body.classList.remove('is-reading');
  showArt('city');
  updateCover();
  if (address) setAddress(-1);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (focus) byId('start-story').focus({ preventScroll: true });
}

function advance() {
  if (current < 0 || dialog.open) return;
  if (current === SCENES.length - 1) { updateBookmark(current, true); showCover(); }
  else showScene(current + 1);
}

function closeChapters(restoreFocus = true) {
  dialog.close();
  if (restoreFocus) dialogOpener?.focus({ preventScroll: true });
}

function populateChapters(container, descriptions) {
  CHAPTERS.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chapter-card';
    button.dataset.chapter = String(index);
    const small = document.createElement('small'); small.textContent = chapter.label;
    const title = document.createElement('strong'); title.textContent = chapter.title;
    const state = document.createElement('span'); state.className = 'chapter-state'; state.setAttribute('aria-hidden', 'true');
    button.append(small, title, state);
    if (descriptions) { const detail = document.createElement('span'); detail.className = 'chapter-description'; detail.textContent = chapter.description; button.append(detail); }
    button.addEventListener('click', () => {
      if (dialog.open) closeChapters(false);
      showScene(SCENES.findIndex(scene => scene.id === chapter.start));
      byId('story-main').focus({ preventScroll: true });
    });
    container.append(button);
  });
}

populateChapters(byId('cover-chapters'), false);
populateChapters(byId('dialog-chapters'), true);
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); byId('story-main').focus(); });
byId('start-story').addEventListener('click', () => { showScene(0); byId('next-scene').focus({ preventScroll: true }); });
byId('resume-story').addEventListener('click', () => { showScene(bookmark?.index ?? 0); byId('next-scene').focus({ preventScroll: true }); });
byId('previous-scene').addEventListener('click', () => showScene(current - 1));
byId('next-scene').addEventListener('click', advance);
byId('open-chapters').addEventListener('click', event => { dialogOpener = event.currentTarget; updateChapterStates(); dialog.showModal(); });
byId('close-chapters').addEventListener('click', () => closeChapters());
byId('back-cover').addEventListener('click', () => { closeChapters(false); showCover(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeChapters(); } });
dialog.addEventListener('cancel', () => { dialogOpener?.focus({ preventScroll: true }); });
byId('retry-art').addEventListener('click', () => { const scene = SCENES[current]; showArt(scene?.art || 'city', scene?.position, true); });
artLayers[0].addEventListener('error', () => { if (activeArt === 'city' && activeLayer === 0) byId('art-error').hidden = false; });

document.addEventListener('keydown', event => {
  if (current < 0 || dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.closest('input,textarea,select,[contenteditable],soop-adventure-lobby')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); advance(); }
  if (event.key === 'ArrowLeft' && current > 0) { event.preventDefault(); showScene(current - 1); }
});
const swipeSurface = byId('swipe-surface');
swipeSurface.addEventListener('touchstart', event => { touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
swipeSurface.addEventListener('touchend', event => {
  if (!touchStart || current < 0 || dialog.open || !event.changedTouches.length) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
  if (dx < 0) advance(); else if (current > 0) showScene(current - 1);
}, { passive: true });
swipeSurface.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
window.addEventListener('hashchange', () => { const index = sceneFromHash(location.hash); if (index >= 0) showScene(index, { address: false }); else showCover({ address: false }); });
window.addEventListener('pageshow', () => { if (current < 0) { bookmark = readBookmark(storage) || bookmark; updateCover(); } });

updateCover();
const initial = sceneFromHash(location.hash);
if (initial >= 0) showScene(initial, { address: false, scroll: false });
else if (artLayers[0].complete && !artLayers[0].naturalWidth) byId('art-error').hidden = false;

}
