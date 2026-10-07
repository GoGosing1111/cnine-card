// Lossless storage only. HTTP responses and the authoritative battle timeline
// keep their existing shape; old plain JSON receipts remain readable.
const FORMAT='SCRAPYARD_GZIP_V1',COMPRESS_AFTER=512000,MAX_STORED=850000;
export const SCRAPYARD_RECORD_RAW_LIMIT=8*1024*1024;
const utf8=new TextEncoder();
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const tooLarge=()=>fail('SCRAPYARD_V3_PAYLOAD','원정 기록이 허용 크기를 초과했습니다. 입장권은 사용하지 않았습니다.');
const invalid=()=>fail('SCRAPYARD_V3_RECORD','저장된 원정 기록을 읽을 수 없습니다.');
export async function encodeScrapyardRecord(value){
  const json=JSON.stringify(value),bytes=utf8.encode(json);
  if(bytes.length>SCRAPYARD_RECORD_RAW_LIMIT)tooLarge();
  if(bytes.length<=COMPRESS_AFTER)return json;
  const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';for(let offset=0;offset<compressed.length;offset+=32768)binary+=String.fromCharCode(...compressed.subarray(offset,offset+32768));
  // Keep the engine marker visible to the legacy stale-ticket refund filter,
  // and difficulty visible to status polling without inflating the timeline.
  const stored=JSON.stringify({recordEncoding:FORMAT,engineVersion:value.engineVersion,difficulty:value.difficulty,decodedBytes:bytes.length,data:btoa(binary)});
  if(utf8.encode(stored).length>MAX_STORED)tooLarge();
  return stored;
}
export async function decodeScrapyardRecord(text){
  const record=JSON.parse(String(text));
  if(!record?.recordEncoding)return record;
  if(record.recordEncoding!==FORMAT||!Number.isSafeInteger(record.decodedBytes)||record.decodedBytes<1||record.decodedBytes>SCRAPYARD_RECORD_RAW_LIMIT||typeof record.data!=='string'||utf8.encode(String(text)).length>MAX_STORED)invalid();
  let reader;
  try{
    const compressed=Uint8Array.from(atob(record.data),char=>char.charCodeAt(0));
    reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true});let length=0,json='';
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>record.decodedBytes||length>SCRAPYARD_RECORD_RAW_LIMIT)invalid();json+=decoder.decode(value,{stream:true});}
    json+=decoder.decode();if(length!==record.decodedBytes)invalid();
    const value=JSON.parse(json);
    if(value.engineVersion!==record.engineVersion||JSON.stringify(value.difficulty)!==JSON.stringify(record.difficulty))invalid();
    return value;
  }catch{await reader?.cancel().catch(()=>{});invalid();}
  finally{reader?.releaseLock();}
}
