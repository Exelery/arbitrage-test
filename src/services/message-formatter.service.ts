import { MarketType, SpreadData } from "../types";
import { EXCHANGES } from "../config/exchanges.config";
import { AnalyzedPriceData, PriceAnalyzer } from "./price-analyzer.service";

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
  spreadWithBest?: number;
}

export class MessageFormatter {
  static getExchangeLink(
    exchange: string,
    symbol: string,
    marketType: MarketType,
    dexscreener?: any
  ): string {
    let formattedSymbol = symbol.replace(
      "/",
      exchange === "bitget"
        ? ""
        : exchange === "bitget" || exchange === "gate"
        ? "_"
        : "-"
    );

    switch (exchange.toLowerCase()) {
      case "mexc":
        formattedSymbol = symbol.replace("/", "_");
        return marketType === MarketType.SPOT
          ? `https://www.mexc.com/ru-RU/exchange/${formattedSymbol}`
          : `https://futures.mexc.com/ru-RU/exchange/${formattedSymbol}`;
        break;
      case "kucoin":
        return marketType === MarketType.SPOT
          ? `https://www.kucoin.com/trade/${formattedSymbol}`
          : `https://futures.kucoin.com/trade/${formattedSymbol}`;
      case "gate":
        return marketType === MarketType.SPOT
          ? `https://www.gate.io/trade/${formattedSymbol}`
          : `https://www.gate.io/futures/${formattedSymbol}`;
      case "bitget":
        return marketType === MarketType.SPOT
          ? `https://www.bitget.com/spot/${formattedSymbol}`
          : `https://www.bitget.com/ru/futures/usdt/${formattedSymbol}`; //`https://www.bitget.com/futures/${formattedSymbol}_UMCBL`;
      case "dexscreener":
        return dexscreener?.getPairUrl() || "";
      default:
        return "";
    }
  }

  static formatUltraModeMessage(
    analyzedData: AnalyzedPriceData,
    lastMaxSpread: number | null,
    dexscreener?: any
  ): { maxSpread: number; message: string } {
    const { bestBid, bestAsk, currentSpread, groupedPrices } = analyzedData;
    const tokenName = bestBid.symbol.split("/")[0];

    let message = `🪙 ${tokenName}\n\n`;

    // Выводим информацию по каждой бирже
    for (const [exchange, prices] of Object.entries(groupedPrices)) {
      message += `${exchange.toLowerCase()}\n`;

      for (const price of prices.sort((a, b) =>
        a.marketType === MarketType.SPOT ? -1 : 1
      )) {
        const marketType = price.marketType === MarketType.SPOT ? "S" : "F";
        const isBestBid = PriceAnalyzer.isBestPrice(price.bid, bestBid.bid);
        const isBestAsk = PriceAnalyzer.isBestPrice(price.ask, bestAsk.ask);

        const bidStr = isBestBid
          ? `🔥${price.bid.toFixed(6)}`
          : price.bid.toFixed(6);
        const askStr = isBestAsk
          ? `🔥${price.ask.toFixed(6)}`
          : price.ask.toFixed(6);

        const fundingStr =
          price.funding !== undefined
            ? ` | 💰${price.funding.toFixed(4)}%`
            : "";

            const depositStatus = price.tokenStatus?.deposit 
            ? `<a href="${MessageFormatter.getDepositLink(exchange, tokenName)}">D</a>` 
            : "D";
          const withdrawStatus = price.tokenStatus?.withdraw 
            ? `<a href="${MessageFormatter.getWithdrawLink(exchange, tokenName)}">W</a>` 
            : "W";
        const statusStr = `${depositStatus}:${price.tokenStatus?.deposit ? "✅" : "🚫"} ${withdrawStatus}:${
          price.tokenStatus?.withdraw ? "✅" : "🚫"
        }`;
        const link = this.getExchangeLink(
          price.exchange,
          price.symbol,
          price.marketType,
          dexscreener
        );

        message += `${marketType}: ${bidStr} | ${askStr}${fundingStr} | ${statusStr} | <a href="${link}">Trade</a>\n`;
      }
      message += "\n";
    }

    // Форматируем изменение спреда
    const spreadChange =
      lastMaxSpread !== null ? currentSpread - lastMaxSpread : 0;
    const changeEmoji =
      spreadChange > 0 ? "📈" : spreadChange < 0 ? "📉" : "➡️";
    const changeStr =
      Math.abs(spreadChange) >= 0.01
        ? ` ${changeEmoji}${Math.abs(spreadChange).toFixed(2)}%`
        : "";

    message = message.slice(0, -1);
    message += `\nСпред: ${currentSpread.toFixed(2)}%${changeStr}\n`;
    message += `${bestAsk.exchange.toLowerCase()}(${
      bestAsk.marketType === MarketType.SPOT ? "spot" : "futures"
    }) ➜ ${bestBid.exchange.toLowerCase()}(${
      bestBid.marketType === MarketType.SPOT ? "spot" : "futures"
    })`;

    return { maxSpread: currentSpread, message };
  }

  static formatHelpMessage(): string {
    return (
      "📚 Справка по командам:\n\n" +
      "1️⃣ Начать отслеживание:\n" +
      "   /track SYMBOL\n" +
      "   Пример: /track BTC/USDT\n\n" +
      "2️⃣ Остановить отслеживание:\n" +
      "   /stop SYMBOL\n" +
      "   Пример: /stop BTC/USDT\n\n" +
      "3️⃣ Остановить все отслеживания:\n" +
      "   /stopall\n\n" +
      "4️⃣ Посмотреть список отслеживаемых пар:\n" +
      "   /list\n\n" +
      "5️⃣ Показать популярные пары:\n" +
      "   /pairs\n\n" +
      "6️⃣ Отслеживание по ссылке:\n" +
      "   /track_link URL MIN_SPREAD\n" +
      "   Пример: /track_link https://www.mexc.com/exchange/BTC_USDT 1.5\n\n" +
      "7️⃣ Остановить отслеживание по ссылке:\n" +
      "   /stop_link URL\n\n" +
      "8️⃣ Отслеживание спреда между биржами:\n" +
      "   /track_pair URL1 URL2 MIN_SPREAD MAX_SPREAD\n" +
      "   Пример: /track_pair https://mexc.com/BTC_USDT https://gate.io/BTC_USDT 1.5 3.0\n\n" +
      "⚠️ Важно: Бот отправляет уведомления только при изменении спреда более чем на 1%"
    );
  }

  static formatStartMessage(): string {
    return (
      "Привет! Я бот для отслеживания спредов между бржами.\n\n" +
      "Доступные команды:\n" +
      "🔍 /track SYMBOL - начать отслеживание (например: /track BTC/USDT)\n" +
      "🛑 /stop SYMBOL - остановить отслеживание\n" +
      "🚫 /stopall - остановить все отслеживания\n" +
      "📋 /list - список отслеживаемых пар\n" +
      "💱 /pairs - показать популярные пары\n" +
      "❓ /help - показать эту справку\n\n" +
      "Примечание: Формат пары должен быть в виде BASE/QUOTE (например: BTC/USDT)"
    );
  }

  static formatSpreadMessage(
    spreadData: SpreadData,
    lastSpreadData: SpreadData | null
  ): string {
    const spreadChange = lastSpreadData
      ? (spreadData.spreadPercentage - lastSpreadData.spreadPercentage).toFixed(
          2
        )
      : "0.00";
    const changeEmoji =
      Number(spreadChange) > 0 ? "📈" : Number(spreadChange) < 0 ? "📉" : "➡️";

    return (
      `${spreadData.exchange1}(${
        spreadData.market1Type
      }): ${spreadData.price1}\n` +
      `${spreadData.exchange2}(${
        spreadData.market2Type
      }): ${spreadData.price2}\n` +
      `💰 ${spreadData.spreadPercentage.toFixed(
        2
      )}% ${changeEmoji}${spreadChange}%`
    );
  }

  static formatTrackingStartMessage(
    symbol: string,
    isUltraMode: boolean,
    market1Type: MarketType,
    market2Type: MarketType,
    selectedExchanges: string[],
    minSpreadPercent: number,
    minChange: number,
    // actualSymbols: { [exchange: string]: { spot?: string; futures?: string } }
  ): string {
    let message = `✅ Начато отслеживание ${symbol}${
      isUltraMode ? " (ULTRA MODE)" : ` (${market1Type}-${market2Type})`
    }\n`;
    
    message += `📊 Биржи: ${selectedExchanges.join(", ")}\n`;
    message += `🎯 Минимальный спред: ${minSpreadPercent}%\n`;
    message += `Минимальное изменение: ${minChange}%\n\n`;
    
    // message += "Актуальные символы на биржах:\n";
    // for (const [exchange, symbols] of Object.entries(actualSymbols)) {
    //   message += `${exchange}: `;
    //   if (symbols.spot) message += `SPOT: ${symbols.spot} `;
    //   if (symbols.futures) message += `FUT: ${symbols.futures}`;
    //   message += "\n";
    // }

    return message;
  }

  static formatSpreadNotification(spreadData: SpreadData): string {
    return `
🔄 Найден арбитраж!

📊 Спред: ${spreadData.spreadPercentage.toFixed(2)}%

📈 Лучшая цена покупки (Ask):
${spreadData.exchange1} (${spreadData.market1Type}): ${spreadData.price1}

📉 Лучшая цена продажи (Bid):
${spreadData.exchange2} (${spreadData.market2Type}): ${spreadData.price2}

⏰ ${new Date().toLocaleTimeString()}
`;
  }

  static formatTrackCommandHelp(): string {
    return (
      "Пожалуйста, укажите параметры в формате:\n" +
      "/track SYMBOL [market-types] [exchanges] [min-spread]\n" +
      "Или используйте ULTRA режим:\n" +
      "/track SYMBOL ultra [exchanges] [min-spread]\n\n" +
      "Примеры:\n" +
      "/track BTC/USDT\n" +
      "/track BTC/USDT spot-futures mexc,kucoin 1.5\n" +
      "/track BTC/USDT ultra cex 2.5\n" +
      "/track BTC/USDT ultra all 1.0"
    );
  }

  static formatInvalidExchangesMessage(): string {
    return (
      "Неверный формат бирж. Допустимые значения:\n" +
      EXCHANGES.ALL.join(", ") +
      " или all"
    );
  }

  static formatInvalidMarketTypesMessage(): string {
    return (
      "Неверный формат типов рынков. Допустимые форматы:\n" +
      "spot-spot, spot-futures, futures-futures"
    );
  }

  static formatInvalidSpreadMessage(): string {
    return "Неверный формат минимального спреда. Укажите положительное число";
  }

  static formatErrorMessage(symbol: string, error: string): string {
    return `Ошибка при получении данных для ${symbol}: ${error}`;
  }

  static formatRestartMessage(): string {
    return "✅ Бот успешно перезапущен и готов к работе!";
  }

  static formatShutdownMessage(): string {
    return "🔄 Бот перезапускается для обновления...";
  }

  static getDepositLink(exchange: string, token: string): string {
    switch (exchange.toLowerCase()) {
      case 'mexc':
        return `https://www.mexc.com/assets/deposit/${token}`;
      case 'kucoin':
        return `https://www.kucoin.com/assets/deposit/${token}`;
      case 'gate':
        return `https://www.gate.io/ru/myaccount/deposit/${token}`;
      case 'bitget':
        return `https://www.bitget.com/deposit/${token}`;
      default:
        return '#';
    }
  }

  static getWithdrawLink(exchange: string, token: string): string {
    switch (exchange.toLowerCase()) {
      case 'mexc':
        return `https://www.mexc.com/assets/withdraw/${token}`;
      case 'kucoin':
        return `https://www.kucoin.com/assets/withdraw/${token}`;
      case 'gate':
        return `https://www.gate.io/ru/myaccount/withdraw/${token}`;
      case 'bitget':
        return `https://www.bitget.com/withdraw/${token}`;
      default:
        return '#';
    }
  }

}
