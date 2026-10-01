import {jointError} from './_joint_request.js';
export async function claimIdleV3(){
  throw jointError('IDLE_DUNGEON_RETIRED','방치형 원정은 종료되었습니다.',410);
}
