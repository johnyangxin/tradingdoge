import dotenv from 'dotenv';
import { processStockData } from '../src/signals.js';

dotenv.config();

await processStockData('UVIX', '2h');
await processStockData('UVIX', '4h');
console.log('UVIX 2h/4h signals processed');