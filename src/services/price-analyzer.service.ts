import { MarketType } from "../types";

interface PriceInfo {
  exchange: string;
  marketType: MarketType;
  bid: number;
  ask: number;
  symbol: string;
  funding?: number;
  tokenStatus?: {
    deposit: boolean;
    withdraw: boolean;
  };
}

export interface AnalyzedPriceData {
  bestBid: PriceInfo;
  bestAsk: PriceInfo;
  currentSpread: number;
  groupedPrices: { [exchange: string]: PriceInfo[] };
}

export class PriceAnalyzer {
  static analyzePrices(prices: PriceInfo[]): AnalyzedPriceData {
    // Находим лучшие bid и ask среди всех бирж
    const sortedByBid = [...prices].sort((a, b) => b.bid - a.bid);
    const sortedByAsk = [...prices].sort((a, b) => a.ask - b.ask);
    const bestBid = sortedByBid[0];
    const bestAsk = sortedByAsk[0];
    
    // Расчет спреда
    const currentSpread = ((bestBid.bid - bestAsk.ask) / bestAsk.ask) * 100;

    // Группировка цен по биржам
    const groupedPrices = prices.reduce((acc, price) => {
      if (!acc[price.exchange]) {
        acc[price.exchange] = [];
      }
      acc[price.exchange].push(price);
      return acc;
    }, {} as { [key: string]: PriceInfo[] });

    return {
      bestBid,
      bestAsk,
      currentSpread,
      groupedPrices
    };
  }

  static isBestPrice(price: number, bestPrice: number): boolean {
    return Math.abs(price - bestPrice) < 0.000001;
  }
} 