import { ExchangeAdapter, MarketType, OrderBook } from "../types";
import axios from "axios";

export class DexScreener implements ExchangeAdapter {
  private readonly baseUrl = "https://api.dexscreener.com/latest/dex";
  private lastPairUrl: string | null = null;
  private readonly minVolume = 1000; // Минимальный объем в USD

  getName(): string {
    return "DexScreener";
  }

  getMarketTypes(): MarketType[] {
    return [MarketType.SPOT];
  }

  getPairUrl(): string | null {
    return this.lastPairUrl;
  }

  async getPrice(symbol: string, marketType: MarketType): Promise<number> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { q: formattedSymbol },
      });

      if (!response.data.pairs || response.data.pairs.length === 0) {
        throw new Error(`No pairs found for ${symbol}`);
      }

      // Фильтруем пары по объему
      const validPairs = response.data.pairs.filter((pair: any) => {
        const volume = parseFloat(pair.volume?.h24 || "0");
        return volume >= this.minVolume;
      });

      if (validPairs.length === 0) {
        throw new Error(`No pairs with sufficient volume found for ${symbol}`);
      }

      // Сортируем по объему и берем пару с наибольшим объемом
      const bestPair = validPairs.sort((a: any, b: any) => {
        const volumeA = parseFloat(a.volume?.h24 || "0");
        const volumeB = parseFloat(b.volume?.h24 || "0");
        return volumeB - volumeA;
      })[0];

      this.lastPairUrl = bestPair.url;
      return parseFloat(bestPair.priceUsd);
    } catch (error) {
      console.error(`Error fetching price from DexScreener: ${error}`);
      throw error;
    }
  }

  async getOrderBook(
    symbol: string,
    marketType: MarketType = MarketType.SPOT
  ): Promise<OrderBook> {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { q: symbol },
      });

      if (!response.data.pairs || response.data.pairs.length === 0) {
        throw new Error(`No pairs found for ${symbol}`);
      }

      // Фильтруем пары по объему
      const validPairs = response.data.pairs.filter((pair: any) => {
        const volume = parseFloat(pair.volume?.h24 || "0");
        return volume >= this.minVolume; //&& pair.name?.includes(formattedSymbol);
      });

      if (validPairs.length === 0) {
        throw new Error(`No pairs with sufficient volume found for ${symbol}`);
      }

      // Сортируем по объему и берем пару с наибольшим объемом
      const bestPair = validPairs.sort((a: any, b: any) => {
        const volumeA = parseFloat(a.volume?.h24 || "0");
        const volumeB = parseFloat(b.volume?.h24 || "0");
        return volumeB - volumeA;
      })[0];

      this.lastPairUrl = bestPair.url;
      const price = parseFloat(bestPair.priceUsd);

      // Добавляем информацию об объеме в лог
      console.log(
        `Selected ${symbol} pair on ${bestPair.dexId} with 24h volume: $${bestPair.volume.h24}`
      );

      const spread = 0.001;
      return {
        bids: [[price * (1 - spread), 1.0]],
        asks: [[price * (1 + spread), 1.0]],
        symbol: symbol,
      };
    } catch (error) {
      console.error(`Error fetching order book from DexScreener: ${error}`);
      throw error;
    }
  }

  private formatSymbol(symbol: string): string {
    return symbol.split("/")[0];
  }

  async getNetworks(token: string): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { q: token },
      });

      if (!response.data.pairs || response.data.pairs.length === 0) {
        return [];
      }

      // Получаем уникальные chainId из пар
      const networks = new Set(
        response.data.pairs
          .filter(
            (pair: any) => parseFloat(pair.volume?.h24 || "0") >= this.minVolume
          )
          .map((pair: any) => pair.chainId.toUpperCase())
      );

      return Array.from(networks) as string[];
    } catch (error) {
      console.error(`Error getting networks from DexScreener: ${error}`);
      return [];
    }
  }
}
