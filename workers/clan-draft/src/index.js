import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {ensureDraftAlarm,handleDraftAlarm} from './schedule.js';
import {ensureDuoAlarm,handleDuoAlarm} from './duo-schedule.js';

// One coordination object for the official clan competition, not for game requests.
export class ClanDraftAlarm extends DurableObject{
  async ensureArmed(){return ensureDraftAlarm(this.ctx.storage)}
  async alarm(){await handleDraftAlarm(this.ctx.storage,this.env)}
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
  async scheduled(){await this.arm()}
  async fetch(){return new Response('Not found',{status:404})}
}
