import { BATCH_COLLECTOR_OPTIONS} from "../constants/index.js";

export async function* createBatchCreator(
    stream: AsyncGenerator<string>,
):AsyncGenerator<string[]>{
   let batch: string[]=[];
   for await(const chunk of stream){
    batch.push(chunk);

    if(batch.length === BATCH_COLLECTOR_OPTIONS.batchSize){
       yield batch;
       batch=[]; 
    }
   }
   if(batch.length>0){
    yield batch;
   } 
}