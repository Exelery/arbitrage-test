import { ExchangeAdapter, MarketType, OrderBook } from "../types";
import * as ccxt from "ccxt";
import { config } from "../config/config";

export class BitgetAdapter implements ExchangeAdapter {
  private spotExchange: ccxt.bitget;
  private futuresExchange: ccxt.bitget;

  constructor() {
    console.log('Initializing Bitget adapter...');
    this.spotExchange = new ccxt.bitget({
      ...config.exchanges.bitget,
      enableRateLimit: true,
    });

    this.futuresExchange = new ccxt.bitget({
      ...config.exchanges.bitget,
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
        defaultSubType: 'linear',
      },
    });
    console.log('Bitget adapter initialized successfully');
  }

  getName(): string {
    return "Bitget";
  }

  getMarketTypes(): MarketType[] {
    return [MarketType.SPOT, MarketType.FUTURES];
  }

  async getPrice(symbol: string, marketType: MarketType): Promise<number> {
    try {
      const exchange = marketType === MarketType.SPOT 
        ? this.spotExchange 
        : this.futuresExchange;
      const ticker = await exchange.fetchTicker(symbol);
      return ticker.last || 0;
    } catch (error) {
      console.error(`Error fetching ${marketType} price from Bitget: ${error}`);
      throw error;
    }
  }

  async getOrderBook(
    symbol: string,
    marketType: MarketType = MarketType.SPOT
  ): Promise<OrderBook> {
    try {
      const exchange = marketType === MarketType.SPOT 
        ? this.spotExchange 
        : this.futuresExchange;
      const formattedSymbol = marketType === MarketType.FUTURES 
        ? `${symbol}` 
        : symbol;
      const orderBook = await exchange.fetchOrderBook(formattedSymbol, 5);
      
      if (!orderBook.bids.length || !orderBook.asks.length) {
        throw new Error('Empty orderbook received');
      }

      return {
        bids: [[Number(orderBook.bids[0][0]).toString(), Number(orderBook.bids[0][1]).toString()]],
        asks: [[Number(orderBook.asks[0][0]).toString(), Number(orderBook.asks[0][1]).toString()]],
        symbol: symbol
      };
    } catch (error) {
      console.error(`Error fetching ${marketType} order book from Bitget:`, error);
      throw error;
    }
  }

  async getFundingRate(symbol: string): Promise<number> {
    try {
      const formattedSymbol = symbol.split('/').join('');
      // console.log('formattedSymbol', formattedSymbol)
      const response = await this.futuresExchange.fetchFundingRate(formattedSymbol);
      return response.fundingRate! * 100;
    } catch (error) {
      console.error(`Error fetching funding rate from Bitget: ${error}`);
      throw error;
    }
  }

  async checkTokenStatus(
    token: string
  ): Promise<{ deposit: boolean; withdraw: boolean }> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency) {
        return { deposit: false, withdraw: false };
      }

      return {
        deposit: !!currency.deposit,
        withdraw: !!currency.withdraw,
      };
    } catch (error) {
      console.error(`Error checking token status on Bitget: ${error}`);
      return { deposit: false, withdraw: false };
    }
  }

  async getTokenContract(
    token: string,
    network: string = 'ETH'
  ): Promise<string | null> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency || !currency.info.chains) {
        return null;
      }

      // В Bitget сети хранятся в info.chains
      const chain = currency.info.chains.find((c: any) => 
        c.chain.toUpperCase() === network.toUpperCase() && 
        c.rechargeable
      );

      if (chain && chain.contractAddress) {
        return chain.contractAddress;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token contract from Bitget: ${error}`);
      return null;
    }
  }

  async getNetworks(token: string): Promise<string[]> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency || !currency.info.chains) {
        return [];
      }

      // В Bitget сети хранятся в info.chains
      return currency.info.chains
        .filter((chain: any) => chain.rechargeable)
        .map((chain: any) => chain.chain.toUpperCase());
    } catch (error) {
      console.error(`Error getting networks from Bitget: ${error}`);
      return [];
    }
  }
} 