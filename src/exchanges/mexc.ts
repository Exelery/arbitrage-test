import { ExchangeAdapter, MarketType, OrderBook } from "../types";
import * as ccxt from "ccxt";
import { config } from "../config/config";

export class MexcAdapter implements ExchangeAdapter {
  private spotExchange: ccxt.mexc;
  private futuresExchange: ccxt.mexc;


  constructor() {
    // console.log('mexc',JSON.stringify(config.exchanges.mexc))
    this.spotExchange = new ccxt.mexc({
      ...config.exchanges.mexc,
      secret: config.exchanges.mexc.apiSecret,
      enableRateLimit: true,
    });

    this.futuresExchange = new ccxt.mexc({
      ...config.exchanges.mexc,
      secret: config.exchanges.mexc.apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: "swap",
        defaultSubType: "linear",
      },
    });
  }

  getName(): string {
    return "MEXC";
  }

  getMarketTypes(): MarketType[] {
    return [MarketType.SPOT, MarketType.FUTURES];
  }

  async getPrice(symbol: string, marketType: MarketType): Promise<number> {
    try {
      const exchange =
        marketType === MarketType.SPOT
          ? this.spotExchange
          : this.futuresExchange;
      const ticker = await exchange.fetchTicker(symbol);
      return ticker.last || 0;
    } catch (error) {
      console.error(`Error fetching ${marketType} price from MEXC: ${error}`);
      throw error;
    }
  }

  async getOrderBook(
    symbol: string,
    marketType: MarketType = MarketType.SPOT
  ): Promise<OrderBook> {
    try {
      const exchange =
        marketType === MarketType.SPOT
          ? this.spotExchange
          : this.futuresExchange;
      const formattedSymbol =
        marketType === MarketType.FUTURES ? `${symbol}:USDT` : symbol;
      const orderBook = await exchange.fetchOrderBook(formattedSymbol, 5);
      
      if (!orderBook.bids.length || !orderBook.asks.length) {
        throw new Error('Empty orderbook received');
      }
      
      return {
        bids: [[Number(orderBook.bids[0][0]).toFixed(8), Number(orderBook.bids[0][1]).toString()]],
        asks: [[Number(orderBook.asks[0][0]).toFixed(8), Number(orderBook.asks[0][1]).toString()]],
        symbol: symbol
      };
    } catch (error) {
      console.error(
        `Error fetching ${marketType} order book from MEXC: ${error}`
      );
      throw error;
    }
  }

  async getFundingRate(symbol: string): Promise<number> {
    try {
      const formattedSymbol = `${symbol}:USDT`;
      const response = await this.futuresExchange.fetchFundingRate(
        formattedSymbol
      );
      return response.fundingRate! * 100; // Конвертируем в проценты
    } catch (error) {
      console.error(`Error fetching funding rate from MEXC: ${error}`);
      throw error;
    }
  }

  async checkTokenStatus(
    token: string
  ): Promise<{ deposit: boolean; withdraw: boolean }> {
    try {
      const currencies = await this.spotExchange.spotPrivateGetCapitalConfigGetall({
        coin: token
      });
      // console.log('mexc',JSON.stringify(this.spotExchange))
      //  console.log('currencies',currencies)
      // const futuresCurrencies = await this.futuresExchange.fetchCurrencies();
      // console.log('futuresCurrencies',JSON.stringify(futuresCurrencies))
      const currency = currencies.find((c: any) => c.coin === token);
      // console.log('mexc',JSON.stringify(currency))

      if (!currency) {
        return { deposit: false, withdraw: false };
      }

      // Проверяем статус через chains в info
      // const chains = currency.networkList || [];
      // const hasActiveChain = chains.some((chain: any) => 
      //   chain.withdrawEnable && chain.isWithdrawEnabled
      // );

      return {
        deposit: currency.depositEnable,
        withdraw: currency.withdrawEnable
      };
    } catch (error) {
      console.error(`Error checking token status on MEXC: ${error}`);
      return { deposit: false, withdraw: false };
    }
  }

  async getTokenContract(
    token: string,
    network: string = 'ETH'  // По умолчанию Ethereum
  ): Promise<string | null> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency || !currency.info.chains) {
        return null;
      }

      // Ищем сеть в списке chains
      const chain = currency.info.chains.find((c: any) => 
        c.chain.toUpperCase() === network.toUpperCase() && 
        c.isDepositEnabled
      );

      if (chain && chain.contractAddress) {
        return chain.contractAddress;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token contract from MEXC: ${error}`);
      return null;
    }
  }

  async getNetworks(token: string): Promise<string[]> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      // console.log('mexc',JSON.stringify(currencies))
      const currency = currencies[token];

      if (!currency || !currency.info.chains) {
        return [];
      }

      // Получаем список активных сетей
      return currency.info.chains
        .filter((chain: any) => chain.isDepositEnabled)
        .map((chain: any) => chain.chain.toUpperCase());
    } catch (error) {
      console.error(`Error getting networks from MEXC: ${error}`);
      return [];
    }
  }
}
