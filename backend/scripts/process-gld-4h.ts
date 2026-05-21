import dotenv from 'dotenv';
import { processStockData } from '../src/signals.js';

dotenv.config();

await processStockData('GLD', '4h');
console.log('GLD 4h signals processed');