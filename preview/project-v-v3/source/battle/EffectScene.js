import {BaseBattleEngine} from './BattleEngine.js';

// Consumer builds replace BattleEngine with their combat extension. An ambient
// field has no combat actors and always uses the same base renderer lifecycle.
export const createEffectScene=host=>new BaseBattleEngine({host,effectScene:true});
