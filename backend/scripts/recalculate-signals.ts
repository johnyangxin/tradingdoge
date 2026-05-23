import dotenv from 'dotenv';
import { SYMBOLS, INTERVALS } from '../src/types';
import { clearAllSignals } from '../src/database';
import { processStockData } from '../src/signals';

dotenv.config();

async function main() {
  console.log('Clearing all signals...');
  await clearAllSignals();

  console.log('Recalculating signals from existing stock data...');
  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      console.log(`Processing ${symbol}/${interval}...`);
      await processStockData(symbol as string, interval as string);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
