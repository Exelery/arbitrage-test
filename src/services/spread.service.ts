import { SpreadData, MarketType, ExchangeAdapter, Market } from '../types';
import { Gate } from '../exchanges/gate';
import { Config } from '../config/config';
import { MexcAdapter } from '../exchanges/mexc';
import { KucoinAdapter } from '../exchanges/kucoin';
import { logger } from './logger.service';
import { DexScreener } from '../exchanges/dexscreener';
import { BitgetAdapter } from "../exchanges/bitget";
import { EXCHANGES } from '../config/exchanges.config';

export class SpreadService {
  private exchanges: Map<string, ExchangeAdapter> = new Map();
  private marketAvailability: Map<string, Map<string, Set<MarketType>>> = new Map();
  private unavailableTokens: Map<string, Set<string>> = new Map();
  
  constructor(config: Config) {
    if (config.enabledExchanges.includes('mexc')) {
      this.exchanges.set('mexc', new MexcAdapter());
    }
    if (config.enabledExchanges.includes('kucoin')) {
      this.exchanges.set('kucoin', new KucoinAdapter());
    }
    if (config.enabledExchanges.includes('gate')) {
      this.exchanges.set('gate', new Gate());
    }
    if (config.enabledExchanges.includes('bitget')) {
      this.exchanges.set('bitget', new BitgetAdapter());
    }
    if (config.checkDexScreener) {
      this.exchanges.set('dexscreener', new DexScreener());
    }
  }

  private async checkMarketAvailability(
    symbol: string, 
    exchange: string, 
    marketType: MarketType
  ): Promise<boolean> {
    // Инициализируем структуры кэша, если их нет
    if (!this.marketAvailability.has(symbol)) {
      this.marketAvailability.set(symbol, new Map());
    }
    const symbolMap = this.marketAvailability.get(symbol)!;
    
    if (!symbolMap.has(exchange)) {
      symbolMap.set(exchange, new Set());
    }
    const exchangeSet = symbolMap.get(exchange)!;
    
    // Проверяем кэш на наличие статуса
    if (exchangeSet.has(marketType)) {
      return true;
    }
    if (exchangeSet.has(`${marketType}:unavailable` as any)) {
      return false;
    }

    try {
      const exchangeInstance = this.exchanges.get(exchange)!;
      await exchangeInstance.getOrderBook(symbol, marketType);
      
      // Помечаем рынок как доступный
      exchangeSet.add(marketType);
      return true;
    } catch (error) {
      // Помечаем рынок как недоступный
      exchangeSet.add(`${marketType}:unavailable` as any);
      logger.debug(`Market ${marketType} not available for ${symbol} on ${exchange}`);
      return false;
    }
  }

  private async checkTokenAvailability(
    symbol: string,
    selectedExchanges: string[]
  ): Promise<{ [exchange: string]: { deposit: boolean; withdraw: boolean } }> {
    const [baseToken] = symbol.split('/');
    const result: { [exchange: string]: { deposit: boolean; withdraw: boolean } } = {};

    for (const exchangeName of selectedExchanges) {
      if (!this.unavailableTokens.has(exchangeName)) {
        this.unavailableTokens.set(exchangeName, new Set());
      }
      const unavailableSet = this.unavailableTokens.get(exchangeName)!;

      if (unavailableSet.has(baseToken)) {
        result[exchangeName] = { deposit: false, withdraw: false };
        continue;
      }

      const exchange = this.exchanges.get(exchangeName);
      if (exchange && 'checkTokenStatus' in exchange) {
        try {
          result[exchangeName] = await exchange.checkTokenStatus!(baseToken);
          if (!result[exchangeName].deposit && !result[exchangeName].withdraw) {
            unavailableSet.add(baseToken);
          }
        } catch (error) {
          logger.debug(`Error checking token status for ${baseToken} on ${exchangeName}: ${error}`);
          unavailableSet.add(baseToken);
          result[exchangeName] = { deposit: false, withdraw: false };
        }
      }
    }

    return result;
  }

  async calculateSpread(
    symbol: string,
    market1Type: MarketType = MarketType.SPOT,
    market2Type: MarketType = MarketType.SPOT,
    selectedExchanges: string[] = [...EXCHANGES.DEFAULT]
  ): Promise<SpreadData> {
    const prices: { [key: string]: { bid: number; ask: number } } = {};
    const errors: { [key: string]: string } = {};
    let availableExchanges = 0;
    
    for (const [exchangeName, exchange] of this.exchanges) {
      if (!selectedExchanges.includes(exchangeName)) continue;

      try {
        const orderBook = await exchange.getOrderBook(symbol);
        if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
          prices[exchangeName] = {
            bid: Number(orderBook.bids[0][0]),
            ask: Number(orderBook.asks[0][0])
          };
          availableExchanges++;
        } else {
          errors[exchangeName] = 'Empty orderbook';
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors[exchangeName] = errorMessage;
        logger.debug(`Error getting prices from ${exchangeName}: ${errorMessage}`);
      }
    }

    // Если пара доступна менее чем на двух биржах, выбрасываем ошибку
    if (availableExchanges < 2) {
      const errorMessage = `Pair ${symbol} is available only on ${availableExchanges} exchange(s). Errors: ${
        Object.entries(errors)
          .map(([exchange, error]) => `${exchange}: ${error}`)
          .join(', ')
      }`;
      logger.warn(errorMessage);
      throw new Error(errorMessage);
    }

    let bestBid = { price: 0, exchange: '' };
    let bestAsk = { price: Infinity, exchange: '' };

    Object.entries(prices).forEach(([exchange, price]) => {
      if (price.bid > bestBid.price) {
        bestBid = { price: price.bid, exchange };
      }
      if (price.ask < bestAsk.price) {
        bestAsk = { price: price.ask, exchange };
      }
    });

    // Проверяем, что нашли и лучшую заявку на покупку, и на продажу
    if (bestBid.exchange === '' || bestAsk.exchange === '') {
      const errorMessage = 'Could not find valid bid and ask prices';
      logger.warn(errorMessage, { symbol, prices });
      throw new Error(errorMessage);
    }

    const spreadPercentage = ((bestBid.price - bestAsk.price) / bestAsk.price) * 100;

    const spreadData = {
      symbol,
      exchange1: bestAsk.exchange,
      exchange2: bestBid.exchange,
      price1: bestAsk.price,
      price2: bestBid.price,
      spreadPercentage,
      market1Type,
      market2Type
    };

    logger.debug('Calculated spread', { 
      symbol, 
      spread: spreadPercentage,
      exchanges: `${bestAsk.exchange}->${bestBid.exchange}`
    });

    return spreadData;
  }

  async getAllPrices(
    symbol: string, 
    selectedExchanges: string[] = [...EXCHANGES.DEFAULT]
  ) {
    const tokenStatus = await this.checkTokenAvailability(symbol, selectedExchanges);
    const prices: {
      exchange: string;
      marketType: MarketType;
      bid: number;
      ask: number;
      funding?: number;
      tokenStatus?: {
        deposit: boolean;
        withdraw: boolean;
      };
      symbol: string;
    }[] = [];

    for (const [exchangeName, exchange] of this.exchanges) {
      if (!selectedExchanges.includes(exchangeName)) continue;

      const marketTypes = exchange.getMarketTypes();
      
      for (const marketType of marketTypes) {
        const isAvailable = await this.checkMarketAvailability(symbol, exchangeName, marketType);
        if (!isAvailable) {
          logger.debug(`Skipping unavailable market ${marketType} for ${symbol} on ${exchangeName}`);
          continue;
        }

        try {
          const orderBook = await exchange.getOrderBook(symbol, marketType);
          if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
            const priceData: any = {
              exchange: exchangeName,
              marketType,
              bid: Number(orderBook.bids[0][0]),
              ask: Number(orderBook.asks[0][0]),
              tokenStatus: tokenStatus[exchangeName],
              symbol: orderBook.symbol
            };

            if (marketType === MarketType.FUTURES && 'getFundingRate' in exchange) {
              try {
                const funding = await exchange.getFundingRate!(symbol);
                priceData.funding = funding;
              } catch (error) {
                logger.debug(`Error getting funding rate from ${exchangeName}: ${error}`);
              }
            }

            prices.push(priceData);
          }
        } catch (error) {
          logger.debug(`Error getting prices from ${exchangeName} ${marketType}: ${error}`);
        }
      }
    }

    if (prices.length === 0) {
      throw new Error(`No prices available for ${symbol} on selected exchanges`);
    }

    return prices;
  }

  public getExchange(name: string): ExchangeAdapter | undefined {
    return this.exchanges.get(name);
  }

  async getTokenContracts(
    token: string
  ): Promise<{ [exchange: string]: { [network: string]: string } }> {
    const result: { [exchange: string]: { [network: string]: string } } = {};
    
    for (const [exchangeName, exchange] of this.exchanges.entries()) {
        if ('getTokenContract' in exchange && typeof exchange.getTokenContract === 'function') {
            try {
                // Сначала получаем все доступные сети для токена
                const networks = await this.getAvailableNetworks(exchange, token);
                console.log(`Available networks for ${token} on ${exchangeName}:`, networks);
                
                if (networks.length > 0) {
                    result[exchangeName] = {};
                    
                    // Получаем контракт для каждой сети
                    for (const network of networks) {
                        const contract = await exchange.getTokenContract(token, network);
                        console.log(`Contract for ${token} on ${exchangeName} in ${network}:`, contract);
                        if (contract) {
                            result[exchangeName][network] = contract;
                        }
                    }
                }
            } catch (error) {
                logger.debug(`Failed to get contracts from ${exchangeName}: ${error}`);
            }
        }
    }
    
    console.log('Final contracts result:', JSON.stringify(result, null, 2));
    return result;
  }

  private async getAvailableNetworks(
    exchange: ExchangeAdapter,
    token: string
  ): Promise<string[]> {
    try {
      
        if ('getNetworks' in exchange && typeof exchange.getNetworks === 'function') {
            const networks = await exchange.getNetworks(token);
            return networks;
        }
        
        // Если метод getNetworks не реализован, используем стандартный список сетей
        return ['ETH', 'BSC', 'ARBITRUM', 'POLYGON', 'OPTIMISM', 'AVAX'];
    } catch (error) {
        logger.debug(`Error getting networks for ${token}: ${error}`);
        return [];
    }
  }

  // async getActualSymbols(
  //   symbol: string,
  //   selectedExchanges: string[]
  // ): Promise<{ [exchange: string]: { spot?: string; futures?: string } }> {
  //   const result: { [exchange: string]: { spot?: string; futures?: string } } = {};

  //   for (const exchangeName of selectedExchanges) {
  //     const exchange = this.exchanges.get(exchangeName);
  //     if (!exchange) continue;

  //     result[exchangeName] = {};

  //     try {
  //       if (exchange.getMarketTypes().includes(MarketType.SPOT)) {
  //         const spotSymbol = await this.getActualSymbol(exchange, symbol, MarketType.SPOT);
  //         if (spotSymbol) {
  //           result[exchangeName].spot = spotSymbol;
  //         }
  //       }

  //       if (exchange.getMarketTypes().includes(MarketType.FUTURES)) {
  //         const futuresSymbol = await this.getActualSymbol(exchange, symbol, MarketType.FUTURES);
  //         if (futuresSymbol) {
  //           result[exchangeName].futures = futuresSymbol;
  //         }
  //       }
  //     } catch (error) {
  //       logger.debug(`Error getting actual symbols for ${exchangeName}: ${error}`);
  //     }
  //   }

  //   return result;
  // }

  // private async getActualSymbol(
  //   exchange: ExchangeAdapter,
  //   symbol: string,
  //   marketType: MarketType
  // ): Promise<string | undefined> {
  //   try {
  //     if (!exchange.fetchMarkets) {
  //       logger.debug(`Exchange ${exchange.getName()} does not support fetchMarkets`);
  //       return undefined;
  //     }

  //     const markets = await exchange.fetchMarkets();
  //     const market = markets.find((m: Market) => 
  //       m.base === symbol.split('/')[0] && 
  //       (marketType === MarketType.FUTURES ? m.future : !m.future)
  //     );
  //     return market?.symbol;
  //   } catch (error) {
  //     logger.debug(`Error getting actual symbol: ${error}`);
  //     return undefined;
  //   }
  // }
}