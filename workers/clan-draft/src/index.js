import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {ensureDraftAlarm,handleDraftAlarm} from './schedule.js';
import {ensureDuoAlarm,handleDuoAlarm} from './duo-schedule.js';
import {runRankedReopenSchedule} from './ranked-reopen.js';
import {runCityRotationSchedule} from './city-rotation.js';
import {runOrganizationSchedule} from './organization-schedule.js';
import {runLandDailySchedule} from './land-daily.js';
import {runMercenaryStockSchedule,armMercenaryStockAlarm,handleMercenaryStockAlarm} from './mercenary-stock-schedule.js';

// One coordination object for the official clan competition, not for game requests.
export class ClanDraftAlarm extends DurableObject{
  async ensureArmed(){return ensureDraftAlarm(this.ctx.storage)}
  async armStock(executeAt){return armMercenaryStockAlarm(this.ctx.storage,executeAt)}
  async alarm(){if(await this.ctx.storage.get('mercenaryStockSchedule'))return handleMercenaryStockAlarm(this.ctx.storage,this.env);await handleDraftAlarm(this.ctx.storage,this.env)}
}

// Separate object/connection: large duo registrations cannot delay clan picks.
export class RankedDuoAlarm extends DurableObject{
  async ensureArmed(){return ensureDuoAlarm(this.ctx.storage)}
  async alarm(){await handleDuoAlarm(this.ctx.storage,this.env)}
}

export default class ClanDraftWorker extends WorkerEntrypoint{
  // Service-binding RPC only: no public arm endpoint or game-state input.
  async arm(){
    const [clan,duo]=await Promise.all([this.env.CLAN_DRAFT_ALARM.getByName('official-clan-competition').ensureArmed(),this.env.RANKED_DUO_ALARM.getByName('official-ranked-duo').ensureArmed()]);
    return {...clan,duoNextAlarmAt:duo.nextAlarmAt};
  }
  async scheduled(){
    const stock=()=>runMercenaryStockSchedule(this.env,{arm:at=>this.env.CLAN_DRAFT_ALARM.getByName('mercenary-limited-stock-v1').armStock(at)});
    const results=await Promise.allSettled([this.arm(),runRankedReopenSchedule(this.env),runCityRotationSchedule(this.env),runOrganizationSchedule(this.env),runLandDailySchedule(this.env),stock()]);
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  }
  async fetch(){return new Response('Not found',{status:404})}
}
