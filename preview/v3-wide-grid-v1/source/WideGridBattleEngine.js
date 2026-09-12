import {Assets} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as ScrapyardBattleEngine} from '../../scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleEngine as LiveBattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {mercenaryCount} from './grid-layout.mjs';
import {createMercenaryStations} from './MercenaryStations.js';
import {waitForVisualDrain} from './visual-drain.mjs';

// Only comparison controls and optional mercenary specimens live here.
// Geometry, occupied tiles, support placement and resizing come from common V3.
export class BattleEngine extends ScrapyardBattleEngine {
  constructor(options) {
    super(options);
    this.gridMode = new URLSearchParams(location.search).get('grid') === 'original' ? 'original' : 'wide';
    this.mercenaryCounts = {ALLY: 1, ENEMY: 1}; this.previewMercenaries = [];
  }
  async loadBattlefieldTexture(mode) {
    return this.gridScenario === 'PVP' || mode === 'PVP'
      ? Assets.load('/assets/ui/coin-prediction/arena-v1.png') : super.loadBattlefieldTexture(mode);
  }
  clearPreviewMercenaries() {
    this.setFormationMercenaries([]);
    for (const item of this.previewMercenaries || []) if (!item.root.destroyed) item.root.destroy({children: true});
    this.previewMercenaries = [];
  }
  async applyBattlePayload(payload) {
    this.clearPreviewMercenaries();
    this.gridScenario = payload.wideGridPreview?.scenario || 'PVE';
    if (this.gridScenario === 'PVP') this.instances = new Map();
    const result = this.gridScenario === 'PVP'
      ? await LiveBattleEngine.prototype.applyBattlePayload.call(this, payload) : await super.applyBattlePayload(payload);
    this.previewMercenaries = await createMercenaryStations(this, payload.wideGridPreview?.mercenaries);
    this.previewMercenaries.forEach(item => {item.enabled = this.mercenaryCounts[item.team] === 1;});
    this.setFormationMercenaries(this.previewMercenaries);
    return result;
  }
  async mount(target) {
    await super.mount(target);
    this.gridControl = {setMode: mode => {
      if (this.previewPlaybackBusy) throw new Error('전투 중에는 배치를 바꿀 수 없습니다.');
      if (!['original', 'wide'].includes(mode)) throw new Error('INVALID_GRID_MODE');
      this.gridMode = mode; this.resize(); return this.gridDiagnostics();
    }, setMercenaries: (ally, enemy) => {
      if (this.previewPlaybackBusy) throw new Error('전투 중에는 배치를 바꿀 수 없습니다.');
      this.mercenaryCounts = {ALLY: mercenaryCount(ally), ENEMY: mercenaryCount(enemy)};
      this.previewMercenaries.forEach(item => {item.enabled = this.mercenaryCounts[item.team] === 1;});
      this.setFormationMercenaries(this.previewMercenaries); this.sortCombatDepth(); return this.gridDiagnostics();
    }, refreshViewport: () => {this.app.resize(); return this.gridDiagnostics();},
    geometry: () => this.viewportGeometry(), diagnostics: () => this.gridDiagnostics()};
    window.WideGridLayout = this.gridControl; return this;
  }
  waitForAccountBattleUnitDamageQueueDrain(timeoutMs = 2500) {
    const run = this.accountBattleUnitFireRun;
    return waitForVisualDrain({timeoutMs, clock: () => gsap.globalTimeline.time() * 1000,
      readState: () => ({active: Boolean(run?.active && this.accountBattleUnitFireRun === run),
        queued: this.accountBattleUnitDamageQueue?.length || 0, firing: Boolean(this.accountBattleUnit?.fireTimeline)})});
  }
  diagnostics() {return {...super.diagnostics(), wideGrid: this.gridDiagnostics()};}
  destroy() {
    this.clearPreviewMercenaries();
    if (window.WideGridLayout === this.gridControl) delete window.WideGridLayout;
    super.destroy();
  }
}