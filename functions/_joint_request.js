export function jointError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
export function assertJointOrigin(request){
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin)throw jointError('JOINT_ORIGIN','같은 게임 화면에서 다시 요청하세요.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')throw jointError('JOINT_ORIGIN','다른 사이트에서 전송된 요청은 처리할 수 없습니다.',403);
}
export async function readJointBody(request,{maxBytes=8192,fields}={}){
  assertJointOrigin(request);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw jointError('JOINT_CONTENT_TYPE','JSON 요청이 필요합니다.',415);
  if(Number(request.headers.get('content-length'))>maxBytes)throw jointError('JOINT_BODY_SIZE','요청이 너무 큽니다.',413);
  const reader=request.body?.getReader();if(!reader)throw jointError('JOINT_BODY','요청 내용을 확인하세요.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw jointError('JOINT_BODY_SIZE','요청이 너무 큽니다.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw jointError('JOINT_BODY','올바른 JSON 요청이 필요합니다.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||(fields&&Object.keys(body).some(key=>!fields.includes(key))))throw jointError('JOINT_BODY','허용된 요청 항목을 확인하세요.');
  return body;
}
export function jointResponseError(error,json=(value,status=200)=>Response.json(value,{status})){
  const known=/^(?:JOINT_|PVE_V3_|TOWER_V3_|SCRAPYARD_V3_|IDLE_V3_|MERCENARY_|FORGE_|HYPER_)/.test(String(error.code||''));
  const code=known?error.code:'JOINT_REQUEST_FAILED';
  const status=known?(Number.isInteger(error.status)?error.status:/AUTH|LOGIN/.test(code)?401:/PERMISSION/.test(code)?403:/CONFLICT|LOCK|CLOSED|RUNNING|PENDING/.test(code)?409:400):503;
  return json({ok:false,code,error:known?error.message:'요청을 처리하지 못했습니다. 잠시 후 같은 요청으로 다시 확인하세요.',retryable:!known||/LOCK|PENDING/.test(code)},status);
}
