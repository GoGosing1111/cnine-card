import {STREAMER_PACK} from '../shared/reversecall-streamer-pack-v1.mjs';
import {mountBlackcrownPack} from './mercenary-blackcrown-pack-live.mjs';
export const openStreamerPack=()=>mountStreamerPack();
export const mountStreamerPack=options=>mountBlackcrownPack({...options,pack:STREAMER_PACK});
