// import { ExchangeAdapter, MarketType, OrderBook } from "../types";
// import * as ccxt from "ccxt";
// import { config } from "../config/config";
// import { logger } from "../services/logger.service";

// export class Bybit implements ExchangeAdapter {
//   private spotExchange: ccxt.bybit;
//   private futuresExchange: ccxt.bybit;
//   private futuresList: ccxt.Market[] = [];
//   private spotList: ccxt.Market[] = [];

//   constructor() {
//     this.spotExchange = new ccxt.bybit({
//       ...config.exchanges.bybit,
//       enableRateLimit: true,
//     });

//     this.futuresExchange = new ccxt.bybit({
//       ...config.exchanges.bybit,
//       enableRateLimit: true,
//       options: {
//         defaultType: 'swap',
//         defaultSubType: 'linear'
//       }
//     });
//   }

//   getName(): string {
//     return "KuCoin";
//   }

//   getMarketTypes(): MarketType[] {
//     return [MarketType.SPOT, MarketType.FUTURES];
//   }

//   async getPrice(symbol: string, marketType: MarketType): Promise<number> {
//     try {
//       symbol = await this.getSymbol(symbol, marketType);
//       const exchange =
//         marketType === MarketType.SPOT
//           ? this.spotExchange
//           : this.futuresExchange;
//       const ticker = await exchange.fetchTicker(symbol);
//       return ticker.last || 0;
//     } catch (error) {
//       console.error(`Error fetching ${marketType} price from KuCoin: ${error}`);
//       throw error;
//     }
//   }

//   async getOrderBook(
//     symbol: string,
//     marketType: MarketType = MarketType.SPOT
//   ): Promise<OrderBook> {
//     try {
//       symbol = await this.getSymbol(symbol, marketType);
//       if (!symbol) {
//         throw new Error(`Market ${marketType} not available for this symbol`);
//       }

//       const exchange =
//         marketType === MarketType.SPOT
//           ? this.spotExchange
//           : this.futuresExchange;

//       const orderBook = await exchange.fetchOrderBook(symbol, 20);
//       return {
//         bids: [
//           [Number(orderBook.bids[0][0]).toFixed(8), orderBook.bids[0][1]!],
//         ],
//         asks: [
//           [Number(orderBook.asks[0][0]).toFixed(8), orderBook.asks[0][1]!],
//         ],
//         symbol: symbol,
//       };
//     } catch (error) {
//       logger.debug(
//         `Error fetching ${marketType} order book from KuCoin: ${error}`
//       );
//       throw error;
//     }
//   }

//   async getFutureList(): Promise<ccxt.Market[]> {
//     if (this.futuresList.length === 0) {
//       this.futuresList = await this.futuresExchange.fetchMarkets();
//       // console.log("symbolList", this.futuresList);
//     }
//     return this.futuresList;
//   }
//   async getSpotList(): Promise<ccxt.Market[]> {
//     if (this.spotList.length === 0) {
//       this.spotList = await this.spotExchange.fetchMarkets();
//       // console.log("symbolList", this.spotList);
//     }
//     return this.spotList;
//   }

//   async getSymbol(symbol: string, marketType: MarketType): Promise<string> {
//     try {
//       if (marketType === MarketType.FUTURES) {
//         await this.getFutureList();
//       } else {
//         await this.getSpotList();
//       }

//       const list =
//         marketType === MarketType.FUTURES ? this.futuresList : this.spotList;

//       const findedMarket = list.find(
//         (market) => market!.base === symbol.split("/")[0]
//       );

//       if (!findedMarket) {
//         if (marketType === MarketType.FUTURES) {
//           logger.debug(`Futures market not found for symbol: ${symbol}, skipping...`);
//           return '';
//         }
//         return symbol;
//       }
      
//       return findedMarket?.info.symbol;
//     } catch (error: any) {
//       logger.error(`Error getting symbol for ${symbol} on ${marketType}:`, error);
//       return '';
//     }
//   }

//   async getFundingRate(symbol: string): Promise<number> {
//     try {
//       symbol = await this.getSymbol(symbol, MarketType.FUTURES);
//       const response = await this.futuresExchange.fetchFundingRate(symbol);
//       return response.fundingRate! * 100; // Конвертируем в проценты
//     } catch (error) {
//       console.error(`Error fetching funding rate from KuCoin: ${error}`);
//       throw error;
//     }
//   }

//   async checkTokenStatus(
//     token: string
//   ): Promise<{ deposit: boolean; withdraw: boolean }> {
//     try {
//       const currencies = await this.spotExchange.fetchCurrencies();
//       const currency = currencies[token];
//       // console.log('kucoin',JSON.stringify(currency))
//       if (!currency) {
//         return { deposit: false, withdraw: false };
//       }

//       // Проверяем статус через networkList в info
//       const networks = currency.info.chains || [];
//       const hasActiveDepositNetwork = networks.some(
//         (network: any) => network.isDepositEnabled
//       );
//       const hasActiveWithdrawNetwork = networks.some(
//         (network: any) => network.isWithdrawEnabled
//       );

//       return {
//         deposit: hasActiveDepositNetwork,
//         withdraw: hasActiveWithdrawNetwork,
//       };
//     } catch (error) {
//       console.error(`Error checking token status on KuCoin: ${error}`);
//       return { deposit: false, withdraw: false };
//     }
//   }

//   async getTokenContract(
//     token: string,
//     network: string = "ETH"
//   ): Promise<string | null> {
//     try {
//       const currencies = await this.spotExchange.fetchCurrencies();
//       const currency = currencies[token];

//       if (!currency || !currency.info.networkList) {
//         return null;
//       }

//       // Ищем сеть в networkList
//       const networkInfo = currency.info.networkList.find(
//         (n: any) =>
//           n.chainName.toUpperCase() === network.toUpperCase() &&
//           n.depositEnabled
//       );

//       if (networkInfo && networkInfo.contractAddress) {
//         return networkInfo.contractAddress;
//       }

//       return null;
//     } catch (error) {
//       console.error(`Error getting token contract from KuCoin: ${error}`);
//       return null;
//     }
//   }

//   async getNetworks(token: string): Promise<string[]> {
//     try {
//       const currencies = await this.spotExchange.fetchCurrencies();
//       const currency = currencies[token];

//       if (!currency || !currency.info.networkList) {
//         return [];
//       }

//       // Получаем список активных сетей
//       return currency.info.networkList
//         .filter((network: any) => network.depositEnabled)
//         .map((network: any) => network.chainName.toUpperCase());
//     } catch (error) {
//       console.error(`Error getting networks from KuCoin: ${error}`);
//       return [];
//     }
//   }
// }
