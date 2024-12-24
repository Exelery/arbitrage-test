import { MarketType } from "../types";
import { logger } from "./logger.service";

export interface ParsedLink {
  exchange: string;
  symbol: string;
  marketType: MarketType;
}

export class LinkParser {
  static parse(url: string): ParsedLink | null {
    try {
      const urlObj = new URL(url);
      
      // MEXC
      if (urlObj.hostname.includes('mexc.com')) {
        const isSpot = urlObj.pathname.includes('/exchange/');
        const isFutures = urlObj.pathname.includes('/futures/');
        const symbol = urlObj.pathname.split('/').pop()?.replace('_', '/');
        
        if (symbol) {
          return {
            exchange: 'mexc',
            symbol,
            marketType: isSpot ? MarketType.SPOT : MarketType.FUTURES
          };
        }
      }
      
      // KuCoin
      if (urlObj.hostname.includes('kucoin.com')) {
        const isSpot = urlObj.pathname.includes('/trade/');
        const isFutures = urlObj.pathname.includes('/futures/');
        const symbol = urlObj.pathname.split('/').pop()?.replace('-', '/');
        
        if (symbol) {
          return {
            exchange: 'kucoin',
            symbol,
            marketType: isSpot ? MarketType.SPOT : MarketType.FUTURES
          };
        }
      }

      // Gate.io
      if (urlObj.hostname.includes('gate.io')) {
        const isSpot = urlObj.pathname.includes('/trade/');
        const isFutures = urlObj.pathname.includes('/futures/');
        const symbol = urlObj.pathname.split('/').pop()?.replace('_', '/');
        
        if (symbol) {
          return {
            exchange: 'gate',
            symbol,
            marketType: isSpot ? MarketType.SPOT : MarketType.FUTURES
          };
        }
      }

      // Bitget
      if (urlObj.hostname.includes('bitget.com')) {
        const isSpot = urlObj.pathname.includes('/spot/');
        const isFutures = urlObj.pathname.includes('/futures/');
        const symbol = urlObj.pathname.split('/').pop()?.replace('_', '/');
        
        if (symbol) {
          return {
            exchange: 'bitget',
            symbol,
            marketType: isSpot ? MarketType.SPOT : MarketType.FUTURES
          };
        }
      }

      return null;
    } catch (error: any) {
      logger.error('Error parsing URL:', { error: error.message });
      return null;
    }
  }
} 