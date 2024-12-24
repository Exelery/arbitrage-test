declare module 'kucoin-node-sdk' {
  export interface KucoinConfig {
    apiKey: string;
    apiSecret: string;
    apiPassphrase: string;
    baseUrl?: string;
  }

  export interface MarketTicker {
    sequence: string;
    price: string;
    size: string;
    bestAsk: string;
    bestAskSize: string;
    bestBid: string;
    bestBidSize: string;
    time: number;
  }

  interface APIResponse<T> {
    code: string;
    data: T;
  }

  export const init: (config: KucoinConfig) => void;
  
  export const rest: {
    User: any;
    Trade: any;
    Market: {
      Symbols: {
        getTicker(symbol: string): Promise<APIResponse<MarketTicker>>;
      };
    };
    Margin: any;
    Earn: any;
    VIPLending: any;
    Others: any;
  };

  export const websocket: {
    Datafeed: any;
    Level2: any;
  };
}
