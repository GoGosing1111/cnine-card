import {blackcrownPackPrice} from './mercenary-blackcrown-pack-v1.mjs?v=20261027-v1';

export const BLACKCROWN_AUTO_MAX_BATCHES=100;
const fail=(message,code)=>Object.assign(Error(message),{code});
export function blackcrownAutoQuote(config,count,repeats){
 if(![1,10].includes(count)||!Number.isSafeInteger(repeats)||repeats<1||repeats>BLACKCROWN_AUTO_MAX_BATCHES)throw fail('1회·10회씩, 반복 횟수 1~100회를 선택하세요.','BLACKCROWN_AUTO_INPUT');
 const unitPrice=blackcrownPackPrice(config.settings,count);
 return Object.freeze({count,repeats,revision:config.revision,unitPrice,totalDraws:count*repeats,maxCost:String(BigInt(unitPrice)*BigInt(repeats))});
}
const wait=(ms,signal)=>new Promise(resolve=>{
 if(signal.aborted)return resolve();
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
 const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});
});

export class BlackcrownAutoOpening{
 constructor({session,readConfig,onUpdate=()=>{},isHidden=()=>false,delay=wait,intervalMs=900}){
  Object.assign(this,{session,readConfig,onUpdate,isHidden,delay,intervalMs});
  this.state={running:false,completed:0,totalDraws:0,spent:'0',phase:'idle',reason:''};
 }
 update(patch){Object.assign(this.state,patch);this.onUpdate({...this.state});}
 stop(reason='직접 중지했습니다.'){
  if(!this.state.running||this.stopReason)return;
  this.stopReason=reason;this.controller.abort();this.update({phase:'stopping',reason:'현재 개봉 결과 확인 후 중지합니다.'});
 }
 async start(config,count,repeats){
  if(this.state.running)throw fail('자동뽑기가 진행 중입니다.','BLACKCROWN_BUSY');
  const quote=blackcrownAutoQuote(config,count,repeats);
  if(!config.userOpeningEnabled)throw fail('현재 블랙크라운팩을 개봉할 수 없습니다.','MERCENARY_BLACKCROWN_CLOSED');
  this.stopReason='';this.controller=new AbortController();
  this.update({running:true,completed:0,totalDraws:0,spent:'0',count,repeats,phase:'checking',reason:'',error:false});
  try{
   await this.session.sequence(async draw=>{
    while(this.state.completed<repeats&&!this.stopReason){
     if(this.isHidden()){this.stop('화면을 벗어나 자동뽑기를 중지했습니다.');break;}
     this.update({phase:'checking'});
     const next=await this.readConfig();
     if(this.stopReason)break;
     if(this.isHidden()){this.stop('화면을 벗어나 자동뽑기를 중지했습니다.');break;}
     if(next.revision!==quote.revision)throw fail('판매 설정이 변경돼 중지했습니다. 새 가격·확률을 확인하세요.','MERCENARY_BLACKCROWN_CHANGED');
     if(!next.userOpeningEnabled)throw fail(next.readiness?.blockers?.join(' ')||'판매가 중지돼 자동뽑기를 멈췄습니다.','MERCENARY_BLACKCROWN_CLOSED');
     this.update({phase:'opening'});
     // Resolves only after the confirmed receipt and SS/SSS presentation finish.
     const receipt=await draw(next,count,confirmed=>this.update({completed:this.state.completed+1,totalDraws:this.state.totalDraws+count,spent:String(BigInt(this.state.spent)+BigInt(confirmed.coinCost))}));
     if(this.stopReason||this.state.completed===repeats)break;
     if(BigInt(receipt.coin)<BigInt(quote.unitPrice)){this.stop('다음 개봉에 필요한 코인이 부족해 중지했습니다.');break;}
     this.update({phase:'waiting'});
     await this.delay(this.intervalMs,this.controller.signal);
    }
   });
  }catch(error){this.stopReason=error.message;this.update({error:true});}
  finally{
   const completed=this.state.completed===repeats&&!this.stopReason;
   this.update({running:false,phase:completed?'completed':'stopped',reason:completed?'설정한 자동뽑기를 완료했습니다.':this.stopReason||'자동뽑기를 중지했습니다.'});
  }
  return {...this.state};
 }
}
