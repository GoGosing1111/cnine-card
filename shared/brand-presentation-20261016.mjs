// Display copy only. Never apply this to account names, item codes, URLs,
// authentication keys, reward receipts or persistent installation identity.
export function currentBrandText(value){
 if(typeof value!=='string')return value;
 return value.replace(/(?:숲켓몬|씨켓몬)(?=$|[\s\p{P}]|(?:은|는|이|가|을|를|의|에|에서|으로)(?=$|[\s\p{P}]))/gu,'리버스콜')
  .replace(/숲켓랜드(?=$|[\s\p{P}]|(?:은|는|이|가|을|를|의|에|에서|로)(?=$|[\s\p{P}]))/gu,'리버스랜드')
  .replace(/\bSOOPKETMON\b/g,'REVERSE CALL').replace(/\bSOOPKETLAND\b/g,'REVERSE LAND');
}
export function presentBrandedSystemMessage(message){
 if(message?.sender_type!=='SYSTEM')return message;
 return {...message,title:currentBrandText(message.title),body:currentBrandText(message.body)};
}
