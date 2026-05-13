import { createBatchCreator } from "./batchCreator.js";
import { createRecursiveChunker } from "./chunker.js";
import { createEmbedder } from "./embedder.js";
import { createFileStreamLoader } from "./loader.js";
import { storeEmbeddings } from "./store.js";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filepath = join(__dirname, '..', 'data', 'example.txt');
const loader= createFileStreamLoader(filepath)
const chunker= createRecursiveChunker(loader)
const batchCreator=createBatchCreator(chunker)
const embedder=createEmbedder(batchCreator)
storeEmbeddings(embedder)
export default null