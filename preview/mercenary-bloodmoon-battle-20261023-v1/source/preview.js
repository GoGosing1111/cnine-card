import { mountForBattle, destroy as destroyEngine } from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import { Assets } from 'pixi.js';
import { BattleCharacter, TEAM } from '../../project-v-v3/source/battle/BattleCharacter.js';
import { createMercenaryBattleArtAdapter } from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import { BloodmoonFX, loadCharacterAssets } from './BloodmoonFX.js';
import { settleAssetBatch } from './ResourceLoader.mjs';
const ROOT = '/preview/mercenary-bloodmoon-battle-20261023-v1/', parentDoc = window.parent.document, $ = id => parentDoc.getElementById(id);
const ids = ['CN-02D9DC1E8A8A4209', 'CN-0505936A0CBB4E59', 'CN-25F931CE393D474E', 'CN-23EB4B19986D4818', 'CN-519C181C18DF4B8E'];
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
let engine, renderer, actor, fx, manifest, disposed = false, selection = 0, currentSlug = '', activePaths = [], selectionQueue=Promise.resolve();
function update(instance) {
  if (!instance) return;
  $('play').textContent = instance.playing ? '일시정지' : '재생'; $('scrub').max = instance.plan.duration; $('scrub').value = instance.time;
  $('time').textContent = instance.time.toFixed(2) + ' / ' + instance.plan.duration.toFixed(2) + '초'; $('cue').textContent = instance.state?.label || '대기';
  for (const b of parentDoc.querySelectorAll('[data-action]')) b.setAttribute('aria-pressed', String(b.dataset.action === instance.plan.action));
}
function controls(enabled) { parentDoc.querySelectorAll('[data-action], .playback button, .playback select, #scrub').forEach(e => e.disabled = !enabled); }
function resize() { if (!fx || disposed) return; const playing=fx.playing; fx.pause(); engine.setFormationMercenaries([actor]); actor.cooperativeScaleLocked=true; fx.captureFormation(); fx.render(fx.time); if(playing)fx.play(); }
function selectCharacter(slug) {
  const seq=++selection; currentSlug=slug; controls(false);
  selectionQueue=selectionQueue.catch(()=>{}).then(()=>performSelection(slug,seq));
  return selectionQueue;
}
async function performSelection(slug,seq) {
  if(disposed||seq!==selection)return false;
  fx?.destroy(); fx = null;
  if (actor) { engine.setFormationMercenaries([]); actor.destroy(); actor = null; }
  const oldPaths = activePaths; activePaths = [];
  await Promise.allSettled(oldPaths.map(url => Assets.unload(url)));
  if (disposed || seq !== selection) return false;
  const character = manifest.characters.find(c => c.slug === slug); if (!character) throw new Error('알 수 없는 캐릭터');
  if (character.missing.length) { $('health').textContent = character.name + ' · 리소스 제작 중입니다.'; return false; }
  $('health').textContent = character.name + '의 전투 동작을 불러오고 있습니다.';
  const entry = { code: character.previewCode, name: character.name, sourceArt: manifest.prefix + character.sourceArt.path, battleSprite: manifest.prefix + character.battleSprite.path,
    battleSpriteSha256: character.battleSprite.sha256, battleSpriteFootAnchor: character.battleSpriteFootAnchor };
  const adapter = createMercenaryBattleArtAdapter({ format: 'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1', summary: { battleSpriteReady: 1, battleSpritePending: 0 }, cards: [entry] });
  const art = adapter.resolveForConsumer('BATTLE_FIELD', entry.code);
  const requestedPaths = [...new Set([art.spriteUrl, ROOT + character.sourceArt.path, ...Object.values(character.motion).flatMap(s => s.frames.map(f => ROOT + f.path)), ROOT + character.effects.skill.path])];
  let loaded;
  try {
    loaded = await settleAssetBatch([() => Assets.load(art.spriteUrl), () => Assets.load(ROOT + character.sourceArt.path), () => loadCharacterAssets(character, ROOT)], (value, index) => {
      if (index === 2) for (const group of Object.values(value)) for (const texture of group) texture.destroy(false);
    });
  } catch (error) {
    await Promise.allSettled(requestedPaths.map(url => Assets.unload(url)));
    throw error;
  }
  const [sd, portrait, assets] = loaded;
  if (disposed || seq !== selection) { for (const group of Object.values(assets)) for (const texture of group) texture.destroy(false); await Promise.allSettled(requestedPaths.map(url => Assets.unload(url))); return false; }
  activePaths = requestedPaths;
  actor = new BattleCharacter({ id: character.id, name: character.name, team: TEAM.ALLY, fullBodyTexture: sd, cutInTexture: portrait, fullBodyHeight: 345, accent: Number.parseInt(character.accent.slice(1), 16) });
  actor.fullBodySprite.anchor.set(art.footAnchor.x, art.footAnchor.y); engine.combatLayer.addChild(actor.root); engine.setFormationMercenaries([actor]); actor.root.visible = true; actor.root.alpha = 1; engine.sortCombatDepth();
  actor.fullBodySprite.scale.set(character.battleBodyHeight/character.bodyPixels);
  actor.fullBodyHeight=character.battleBodyHeight; actor.art={bodyHeight:character.battleBodyHeight,calmIdle:true}; actor.cooperativeScaleLocked=true;actor.isMercenary=true; actor.cardId=character.previewCode;
  if(character.displayBodyHeight){actor.formationHudY=-Math.max(410,character.displayBodyHeight+55);actor.hud.y=actor.formationHudY;}
  const targets = engine.enemies.slice().sort((a, b) => b.baseY - a.baseY).slice(0, 3);
  fx = new BloodmoonFX(engine, actor, targets, assets, character, update); fx.setSpeed(Number($('speed').value)); controls(true);
  $('health').textContent = character.name + ' · 동작과 스킬을 재생할 수 있습니다.';
  const heading=document.querySelector('.battle-v3-header strong');if(heading)heading.textContent='BLOODMOON · '+character.name;
  if(!engine.reducedMotion)fx.play();
  return true;
}
function dispose() {
  if (disposed) return; disposed = true; selection++; engine?.app.renderer.off('resize', resize); fx?.destroy();
  // The shared engine owns display roots; stop their idle controllers before it destroys those roots.
  for (const character of engine?.characters || []) { character.animationAdapter?.destroy?.(); if (character.animationController !== character.animationAdapter) character.animationController?.destroy?.(); }
  actor?.destroy(); renderer?.destroy(); destroyEngine();
  const releasedPaths = activePaths; activePaths = []; void Promise.allSettled(releasedPaths.map(url => Assets.unload(url)));
}
async function boot() {
  try {
    const [m, catalogs] = await Promise.all([get(ROOT + 'manifest.json'), Promise.all(['fur/manifest-v2.json', 'zenith/manifest-v1.json', 'superstar/manifest-v1.json'].map(p => get('/assets/ui/project-v/characters/' + p)))]); manifest = m;
    const entries = catalogs.flatMap(m => m.characters.map(c => ({ ...c, grade: m.rarity })));
    const deck = ids.map((id, i) => { const c = entries.find(x => x.cardId === id); if (!c) throw new Error('기준 카드 누락'); return { ...c, id, cardId: id, name: c.member, image: '/' + c.sourceArt, sourceArt: '/' + c.sourceArt, originalCardArt: '/' + c.sourceArt, power_type: ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'ATTACK'][i], hp: 100, maxHp: 100 }; });
    window.cnineCardCatalog = () => deck;
    const payload = { previewOnly: true, mode: 'PVP', battlefieldMode: 'PVP', battleV2: { mode: 'PVP', teams: { A: { cards: deck }, B: { cards: deck } }, result: { timeline: [] } } };
    const api = window.ProjectVPixiBattle; api.mountForBattle = async (data, host) => { engine = await mountForBattle(data, host); return engine; };
    const modal = document.getElementById('lab-modal'), prepared = window.ProjectVBattleV3Live.prepareLoading({ modal, mode: 'PVP', playerName: '블러드문', opponentName: '전투 연출 시연', autoText: '전장 준비 중' });
    try { renderer = await window.ProjectVBattleV3Live.createRenderer({ ...prepared, modal, data: payload, mode: 'PVP', playerName: '블러드문' }); } finally { api.mountForBattle = mountForBattle; }
    await engine.deployCards({ instant: true, force: true });
    engine.audio?.stop?.();
    if(engine.uiLayer?.statusPanel)engine.uiLayer.statusPanel.visible=false;
    if(engine.uiLayer?.status)engine.uiLayer.status.visible=false;
    const notice=document.querySelector('.battle-v3-status');if(notice)notice.style.display='none';
    $('play').onclick = () => fx?.playing ? fx.pause() : fx?.play(); $('restart').onclick = () => { fx?.seek(0); fx?.play(); }; $('cancel').onclick = () => fx?.cancel();
    $('impact').onclick = () => { fx?.setAction('skill'); fx?.seek(fx.plan.contact); }; $('scrub').oninput = () => fx?.seek(Number($('scrub').value)); $('speed').onchange = () => fx?.setSpeed(Number($('speed').value));
    parentDoc.querySelectorAll('[data-action]').forEach(b => b.onclick = () => { fx?.setAction(b.dataset.action); fx?.play(); });
    engine.app.renderer.on('resize', resize);
    const review = { select: selectCharacter, get fx() { return fx; }, get actor() { return actor; }, get engine() { return engine; }, get manifest() { return manifest; }, diagnostics: () => ({ ...fx?.diagnostics(), currentSlug, disposed }), dispose };
    window.BloodmoonPreview = review; window.parent.BloodmoonPreview = review;
    const requested = window.parent.BloodmoonSelectedSlug, first = manifest.characters.find(c => c.slug === requested) || manifest.characters.find(c => !c.missing.length) || manifest.characters[0];
    await selectCharacter(first.slug); window.parent.dispatchEvent(new CustomEvent('bloodmoon-preview-ready'));
    window.addEventListener('pagehide', dispose, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) fx?.cancel(); });
    engine.app.canvas.addEventListener('webglcontextlost', () => { fx?.cancel(); $('health').textContent = '그래픽 연결이 끊어졌습니다. 새로고침해 주세요.'; });
  } catch (e) { $('health').textContent = '전장 준비 실패: ' + e.message; console.error('[BloodmoonPreview]', e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else void boot();
