import { CHUNK_OPTIONS } from "../constants/index.js";

export async function* createRecursiveChunker(
  stream :AsyncGenerator<string>
):AsyncGenerator<string>{
  const effectiveOverlap = Math.min(CHUNK_OPTIONS.chunkOverlap,CHUNK_OPTIONS.chunkSize-1)
  let buffer='';


for await (const text of stream){
  buffer+=text;

  while(buffer.length>=CHUNK_OPTIONS.chunkSize){
    const chunk = buffer.substring(0,CHUNK_OPTIONS.chunkSize);
    yield chunk;
    buffer = buffer.substring(CHUNK_OPTIONS.chunkSize-effectiveOverlap);
  }
}
if(buffer.length>0){
  yield buffer;
}
}