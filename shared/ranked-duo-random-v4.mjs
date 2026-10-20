// Existing seasons without a mode remain readable as fixed-team competitions.
export const DUO_RANDOM_MODE='RANDOM_ASYNC';
export const DUO_FIXED_MODE='FIXED';
export const isRandomDuo=config=>config?.matchmaking===DUO_RANDOM_MODE;
export function duoMatchmaking(value,fallback=DUO_FIXED_MODE){
 const mode=value??fallback;
 if(![DUO_RANDOM_MODE,DUO_FIXED_MODE].includes(mode))throw Object.assign(new Error('듀오 매칭 방식을 확인하세요.'),{code:'DUO_CONFIG',status:400});
 return mode;
}
export function duoRandomInt(max){
 if(!Number.isSafeInteger(max)||max<1||max>4294967296)throw new RangeError('Invalid random range');
 const limit=Math.floor(4294967296/max)*max;
 let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);
 return n%max;
}
export function shuffleDuo(values,random=duoRandomInt){
 const result=[...values];
 for(let i=result.length-1;i>0;i--){const j=random(i+1);[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
