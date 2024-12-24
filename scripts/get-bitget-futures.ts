import * as ccxt from 'ccxt';
import * as fs from 'fs';
import { config } from '../src/config/config';

async function getFuturesList() {
  try {
    console.log('Initializing Bitget connection...');
    
    const exchange = new ccxt.bitget({
      ...config.exchanges.bitget,
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
        defaultSubType: 'linear',
      },
    });

    console.log('Fetching markets...');
    const markets = await exchange.fetchMarkets();
    
    // Фильтруем и форматируем данные
    const futuresData = markets
    //   .filter(market => market.future)
    //   .map(market => ({
    //     symbol: market.symbol,
    //     base: market.base,
    //     quote: market.quote,
    //     id: market.id,
    //     info: market.info
    //   }));

    // Сохраняем в файл
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bitget-futures.json`;
    
    fs.writeFileSync(
      filename,
      JSON.stringify(futuresData, null, 2)
    );
    const fundingRate = await exchange.fetchFundingRate('MOCAUSDT')
    console.log('fundingRate', fundingRate)

    console.log(`Successfully saved ${futuresData.length} futures to ${filename}`);
    
    // Выводим примеры символов
    console.log('\nExample symbols:');
    futuresData
      .slice(0, 5)
      .filter((future): future is NonNullable<typeof future> => future !== undefined)
      .forEach(future => {
        console.log(`Symbol: ${future.symbol}, ID: ${future.id}`);
      });

  } catch (error) {
    console.error('Error:', error);
  }
}

// Запускаем
getFuturesList(); 