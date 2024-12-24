import * as dotenv from "dotenv";
import { cleanEnv, str, num } from "envalid";
import { EXCHANGES } from "./exchanges.config";

dotenv.config();

const env = cleanEnv(process.env, {
  // Telegram
  TELEGRAM_BOT_TOKEN: str(),
  TELEGRAM_CHAT_ID: num(),

  // KuCoin
  KUCOIN_API_KEY: str(),
  KUCOIN_API_SECRET: str(),
  KUCOIN_API_PASSPHRASE: str(),

  // Gate
  GATE_API_KEY: str(),
  GATE_API_SECRET: str(),

  // MEXC
  MEXC_API_KEY: str(),
  MEXC_API_SECRET: str(),

  // General
  UPDATE_INTERVAL: num({ default: 10000 }),

  // Bitget
  BITGET_API_KEY: str(),
  BITGET_SECRET: str(),
  BITGET_PASSWORD: str(),

  // Bybit
  // BYBIT_API_KEY: str(),
  // BYBIT_API_SECRET: str(),
});

// console.log(env)

export interface Config {
  telegram: {
    token: string;
  };
  telegramNotifications: {
    enabled: boolean;
  };
  enabledExchanges: string[];
  checkDexScreener: boolean;
  updateInterval: number;
  logging: {
    level: string;
    file: boolean;
    console: boolean;
  };
  spread: {
    minChange: number;
    minValue: number;
  },
  exchanges: {
    mexc: {
      apiKey: string;
      apiSecret: string;
    };
    kucoin: {
      apiKey: string;
      apiSecret: string;
      apiPassphrase: string;
    };
    gate: {
      apiKey: string;
      apiSecret: string;
    };
    bitget: {
      apiKey: string;
      apiSecret: string;
      apiPassword: string;
    };
    // bybit: {
    //   apiKey: string;
    //   apiSecret: string;
    // };
  };
}

export const config: Config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  telegramNotifications: {
    enabled: true,
  },
  enabledExchanges: [...EXCHANGES.DEFAULT],
  checkDexScreener: true,
  updateInterval: 10000,
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: true,
    console: true,
  },
  spread: {
    minChange: 1,
    minValue: 1,
  },
  exchanges: {
    mexc: {
      apiKey: env.MEXC_API_KEY,
      apiSecret: env.MEXC_API_SECRET,
    },
    kucoin: {
      apiKey: env.KUCOIN_API_KEY,
      apiSecret: env.KUCOIN_API_SECRET,
      apiPassphrase: env.KUCOIN_API_PASSPHRASE,
    },
    gate: {
      apiKey: env.GATE_API_KEY,
      apiSecret: env.GATE_API_SECRET,
    },
    bitget: {
      apiKey: env.BITGET_API_KEY,
      apiSecret: env.BITGET_SECRET,
      apiPassword: env.BITGET_PASSWORD,
    },
    // bybit: {
    //   apiKey: env.BYBIT_API_KEY,
    //   apiSecret: env.BYBIT_API_SECRET,
    // },
  },
};
