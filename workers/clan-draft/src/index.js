import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {ensureDraftAlarm,handleDraftAlarm} from './schedule.js';

// One coordination object for the official clan competition, not for game requests.
export class ClanDraftAlarm extends DurableObject{
  async ensureArmed(){return ensureDraftAlarm(this.ctx.storage)}
  async alarm(){await handleDraftAlarm(this.ctx.storage,this.env)}
}

export default class ClanDraftWorker extends WorkerEntrypoint{
  // Service-binding RPC only: no public arm endpoint or game-state input.
  async arm(){return this.env.CLAN_DRAFT_ALARM.getByName('official-clan-competition').ensureArmed()}
  async scheduled(){await this.arm()}
  async fetch(){return new Response('Not found',{status:404})}
}
