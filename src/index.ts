import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RAG } from './rag/index.js';
import dotenv from 'dotenv';

dotenv.config()
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      QDRANT_URL: string;
      OLLAMA_URL: string;
    }
  }
}
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
app.get('/api/v1/health', (req:Request, res:Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});
app.post('/ask',async (req:Request,res:Response)=>{
  const userData = req.body;
  const {prompt}=userData;
   if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
  const result = await RAG(prompt);
    return res.status(200).json({ data: result });
})
app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

app.use((err:Error, req:Request, res:Response, next:NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
