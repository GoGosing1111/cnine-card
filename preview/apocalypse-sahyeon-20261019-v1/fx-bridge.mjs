import {ApocalypseLegionFX as LiveFX} from '../project-v-v3/source/battle/ApocalypseLegionFX.js';
import {SahyeonFX} from './SahyeonFX.mjs';
export class ApocalypseLegionFX extends LiveFX{
 static preload(skill){return skill?.visual==='HOLLOW_LENS'?SahyeonFX.preload():super.preload(skill);}
 static retain(skills){return super.retain(skills.filter(s=>s.visual!=='HOLLOW_LENS'));}
}
