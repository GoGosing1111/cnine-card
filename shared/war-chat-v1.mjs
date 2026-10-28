export const WAR_CHAT_KEY='war_chat_settings_v1';
export const WAR_CHAT_KINDS=Object.freeze({clan:'클랜전',territory:'영토전',faction:'세력전'});
export const WAR_CHAT_LIMITS=Object.freeze({characters:300,history:100,retained:200,retentionMs:86400000,gateMs:5000,ticketMs:15000,sockets:256,userSockets:2,sendGapMs:1500,roomPerSecond:30});
export function chatSettings(value={}){
 if(!value||!Number.isSafeInteger(value.revision??0)||(value.revision??0)<0)throw Error('Invalid chat settings');
 return {revision:value.revision??0,...Object.fromEntries(Object.keys(WAR_CHAT_KINDS).map(k=>[k,value[k]===true]))};
}
export function chatRoom(kind,round,side){
 const id=`war-chat:${kind}:${round}:${side}`;
 if(!validChatRoom(id))throw Error('Invalid chat room');return id;
}
export const validChatRoom=id=>typeof id==='string'&&/^war-chat:(?:clan:\d{1,15}:[1-8]|territory:\d{1,15}:[AB]|faction:[a-zA-Z0-9_-]{1,80}:(?:[1-9]|1[0-5]))$/.test(id);
export function chatText(value){
 if(typeof value!=='string'||[...value].length>WAR_CHAT_LIMITS.characters||/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value))return null;
 return value.replace(/[\r\n\t]+/g,' ').trim()||null;
}
export const chatRetryMs=(attempt,random=Math.random)=>Math.min(30000,1000*2**Math.min(5,Math.max(0,attempt)))+Math.floor(random()*1000);
