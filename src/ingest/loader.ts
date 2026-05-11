import * as fs from 'fs'
import { Readable } from 'stream'
import { LOADER_OPTIONS } from '../constants/index.js';

export async function* createFileStreamLoader (
    filePath : string,
):AsyncGenerator<string>{
    let stream:Readable;

    if(!fs.existsSync(filePath)){
        throw new Error(`file not found`)
    }
    stream= fs.createReadStream(filePath,LOADER_OPTIONS);
    stream.setEncoding(LOADER_OPTIONS.encoding)
    try{
        for await (const chunk of stream){
        yield chunk as string;
        }
    }catch(error){
        throw new Error(`Stream reading failed: ${(error as Error).message}`)
    }
}
