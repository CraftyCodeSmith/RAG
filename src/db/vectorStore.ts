import { QdrantClient } from "@qdrant/js-client-rest";
import { STORE_OPTIONS } from "../constants/index.js";
let instance: QdrantClient | null = null;
export const getDbClient = (): QdrantClient => {

  if (!instance) {
    instance = new QdrantClient({
            url:STORE_OPTIONS.qdrantUrl
        })
  }
  
  return instance;
};