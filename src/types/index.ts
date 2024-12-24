import { Num } from "ccxt";
import { Context } from "telegraf";

// Базовые типы
export enum MarketType {
  SPOT = "spot",
  FUTURES = "futures",
}

export interface OrderBook {
  bids: Array<[string | number, string | number]>;
  asks: Array<[string | number, string | number]>;
  symbol: string;
}

// Типы для отслеживания
export interface TrackingParams {
  chatId: number;
  symbol: string;
  market1Type: MarketType;
  market2Type: MarketType;
  selectedExchanges: string[];
  minSpreadPercent: number;
  maxSpreadPercent?: number;
  isUltraMode: boolean;
  minChange: number;
}

export interface TrackingInfo {
  interval: NodeJS.Timeout;
  lastSpreadData: SpreadData | null;
  selectedExchanges: string[];
  minSpreadPercent: number;
  maxSpreadPercent?: number;
  isUltraMode: boolean;
  symbol: string;
  minChange: number;
  market1Type: MarketType;
  market2Type: MarketType;
  // actualSymbols: {
  //   [exchange: string]: {
  //     spot?: string;
  //     futures?: string;
  //   };
  // };
} 

export interface SetupState {
  symbol: string;
  market1Type: MarketType;
  market2Type: MarketType;
  step: "exchanges" | "threshold";
  selectedExchanges?: string[];
}

// Типы для спреда
export interface SpreadData {
  symbol: string;
  exchange1: string;
  exchange2: string;
  market1Type: MarketType;
  market2Type: MarketType;
  price1: number;
  price2: number;
  spreadPercentage: number;
}

export interface PriceInfo {
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

// Типы для бирж
export interface ExchangeAdapter {
  getName(): string;
  getMarketTypes(): MarketType[];
  getPrice(symbol: string, marketType: MarketType): Promise<number>;
  getOrderBook(symbol: string, marketType?: MarketType): Promise<OrderBook>;
  getFundingRate?(symbol: string): Promise<number>;
  checkTokenStatus?(token: string): Promise<{ deposit: boolean; withdraw: boolean }>;
  getTokenContract?(token: string, network?: string): Promise<string | null>;
  getNetworks?(token: string): Promise<string[]>;
  fetchMarkets?(): Promise<Market[]>;
}

export interface Market {
  symbol: string;
  base: string;
  quote: string;
  future?: boolean;
  spot?: boolean;
  [key: string]: any;
} 

export interface ParsedLink {
  exchange: string;
  symbol: string;
  marketType: MarketType;
}