import { createBatchCreator } from "./batchCreator.js";
import { createRecursiveChunker } from "./chunker.js";
import { createEmbedder } from "./embedder.js";
import { createFileStreamLoader } from "./loader.js";
import { storeEmbeddings } from "./store.js";

const filepath='' //add filepath
const loader= createFileStreamLoader(filepath)
const chunker= createRecursiveChunker(loader)
const batchCreator=createBatchCreator(chunker)
const embedder=createEmbedder(batchCreator)
storeEmbeddings(embedder)