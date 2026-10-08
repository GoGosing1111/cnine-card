import {jointError} from './_joint_request.js';

// Storage only: preserve the complete authoritative battle and HTTP response.
// Existing uncompressed checkpoints/receipts remain readable without migration.
const FORMAT='EXPEDITION_GZIP_V1',COMPRESS_AFTER=512000,MAX_STORED=750000;
export const EXPEDITION_RECORD_RAW_LIMIT=8*1024*1024;
const utf8=new TextEncoder();
const tooLarge=()=>{throw jointError('PVE_V3_PAYLOAD','전투 기록이 너무 큽니다.');};
const invalid=()=>{throw jointError('PVE_V3_RECORD','저장된 전투 기록을 읽을 수 없습니다.',409);};

export async function encodeExpeditionRecord(value){
  const json=JSON.stringify(value),bytes=utf8.encode(json);
  if(bytes.length>EXPEDITION_RECORD_RAW_LIMIT)tooLarge();
  if(bytes.length<=COMPRESS_AFTER)return json;
  const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';
  for(let offset=0;offset<compressed.length;offset+=32768)binary+=String.fromCharCode(...compressed.subarray(offset,offset+32768));
  const stored=JSON.stringify({recordEncoding:FORMAT,decodedBytes:bytes.length,data:btoa(binary)});
  if(utf8.encode(stored).length>MAX_STORED)tooLarge();
  return stored;
}

export async function decodeExpeditionRecord(text){
  let reader;
  try{
    const raw=String(text);
    if(utf8.encode(raw).length>MAX_STORED)invalid();
    const record=JSON.parse(raw);
    if(!record?.recordEncoding)return record;
    if(record.recordEncoding!==FORMAT||!Number.isSafeInteger(record.decodedBytes)||record.decodedBytes<1||record.decodedBytes>EXPEDITION_RECORD_RAW_LIMIT||typeof record.data!=='string')invalid();
    const compressed=Uint8Array.from(atob(record.data),char=>char.charCodeAt(0));
    reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true});let length=0,json='';
    while(true){
      const {done,value}=await reader.read();if(done)break;
      length+=value.length;if(length>record.decodedBytes||length>EXPEDITION_RECORD_RAW_LIMIT)invalid();
      json+=decoder.decode(value,{stream:true});
    }
    json+=decoder.decode();if(length!==record.decodedBytes)invalid();
    return JSON.parse(json);
  }catch{await reader?.cancel().catch(()=>{});invalid();}
  finally{reader?.releaseLock();}
}
