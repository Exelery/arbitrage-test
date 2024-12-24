import { ExchangeAdapter, MarketType, OrderBook } from "../types";
import * as ccxt from 'ccxt';
import { config } from '../config/config';

export class Gate implements ExchangeAdapter {
  private spotExchange: ccxt.gateio;
  private futuresExchange: ccxt.gateio;

  constructor() {
    this.spotExchange = new ccxt.gateio({
      ...config.exchanges.gate,
      enableRateLimit: true,
    });

    this.futuresExchange = new ccxt.gateio({
      ...config.exchanges.gate,
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
        defaultSubType: 'linear'
      }
    });
  }

  getName(): string {
    return 'Gate';
  }

  getMarketTypes(): MarketType[] {
    return [MarketType.SPOT, MarketType.FUTURES];
  }

  async getPrice(symbol: string, marketType: MarketType): Promise<number> {
    try {
      const exchange = marketType === MarketType.SPOT ? this.spotExchange : this.futuresExchange;
      const ticker = await exchange.fetchTicker(symbol);
      return ticker.last || 0;
    } catch (error) {
      console.error(`Error fetching ${marketType} price from Gate.io: ${error}`);
      throw error;
    }
  }

  async getOrderBook(
    symbol: string,
    marketType: MarketType = MarketType.SPOT
  ): Promise<OrderBook> {
    try {
      const exchange = marketType === MarketType.SPOT ? this.spotExchange : this.futuresExchange;
      const formattedSymbol = marketType === MarketType.FUTURES ? `${symbol}:USDT` : symbol;
      const orderBook = await exchange.fetchOrderBook(formattedSymbol, 5);
      return {
        bids: [[Number(orderBook.bids[0][0]), Number(orderBook.bids[0][1])]],
        asks: [[Number(orderBook.asks[0][0]), Number(orderBook.asks[0][1])]],
        symbol: symbol
      };
    } catch (error) {
      console.error(`Error fetching ${marketType} order book from Gate.io: ${error}`);
      throw error;
    }
  }

  async getFundingRate(symbol: string): Promise<number> {
    try {
      const formattedSymbol = `${symbol}:USDT`;
      const response = await this.futuresExchange.fetchFundingRate(formattedSymbol);
      return response.fundingRate! * 100; // Конвертируем в проценты
    } catch (error) {
      console.error(`Error fetching funding rate from Gate.io: ${error}`);
      throw error;
    }
  }

  async checkTokenStatus(token: string): Promise<{ deposit: boolean; withdraw: boolean }> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency) {
        return { deposit: false, withdraw: false };
      }

      // Проверяем статус через info
      const currencyInfo = currency.info[0] || {};
      return {
        deposit: !currencyInfo.deposit_disabled,
        withdraw: !currencyInfo.withdraw_disabled
      };
    } catch (error) {
      console.error(`Error checking token status on Gate.io: ${error}`);
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

      if (!currency || !currency.networks) {
        return null;
      }

      // Add type assertion to handle the networks object
      const networks = currency.networks as Record<string, any>;
      const networkInfo = networks[network.toUpperCase()];
      
      if (networkInfo && networkInfo.contract) {
        return networkInfo.contract;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token contract from Gate.io: ${error}`);
      return null;
    }
  }

  async getNetworks(token: string): Promise<string[]> {
    try {
      const currencies = await this.spotExchange.fetchCurrencies();
      const currency = currencies[token];

      if (!currency || !currency.networks) {
        return [];
      }

      // Получаем список активных сетей
      return Object.entries(currency.networks)
        .filter(([_, info]: [string, any]) => !info.deposit_disabled)
        .map(([network]) => network.toUpperCase());
    } catch (error) {
      console.error(`Error getting networks from Gate.io: ${error}`);
      return [];
    }
  }
} 