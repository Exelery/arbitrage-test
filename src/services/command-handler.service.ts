import { Telegraf, Context, Message } from "telegraf";
import { TrackingManager } from "./tracking-manager.service";
import { MessageFormatter } from "./message-formatter.service";
import { MarketType } from "../types";
import { Markup } from "telegraf";
import { SpreadService } from "./spread.service";
import { logger } from "./logger.service";
import { EXCHANGES, isValidExchange } from "../config/exchanges.config";
import { config } from "../config/config";
import { PriceAnalyzer } from "./price-analyzer.service";
import { LinkParser } from "./link-parser.service";

// Add type guard
function isTextMessage(message: any): message is Message.TextMessage {
  return 'text' in message;
}

export class CommandHandler {
  private readonly commonPairs = [
    "BTC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "XRP/USDT",
    "DOGE/USDT",
  ];

  private commandsInitialized = false;

  constructor(
    private readonly trackingManager: TrackingManager,
    private readonly bot: Telegraf,
    private readonly spreadService: SpreadService
  ) {}

  setupCommands() {
    if (this.commandsInitialized) {
      logger.warn("Commands already initialized, skipping...");
      return;
    }

    logger.info("Initializing bot commands...");
    this.setupBasicCommands();
    this.setupTrackingCommands();
    this.setupCallbackQueries();

    this.commandsInitialized = true;
    logger.info("Bot commands initialized successfully");
  }

  private setupBasicCommands() {
    this.bot.command("start", (ctx: Context) =>
      ctx.reply(MessageFormatter.formatStartMessage())
    );

    this.bot.command("help", (ctx: Context) =>
      ctx.reply(MessageFormatter.formatHelpMessage())
    );

    this.bot.command("pairs", (ctx: Context) => this.handlePairsCommand(ctx));
    
    // Добавляем команду для проверки контрактов
    this.bot.command("contracts", async (ctx: Context) => {
        const message = ctx.message as any;
        const args = message?.text?.split(" ");
        
        if (!args || args.length < 2) {
            ctx.reply("Укажите токен. Например: /contracts USDT");
            return;
        }

        const token = args[1].toUpperCase();
        try {
            const contracts = await this.spreadService.getTokenContracts(token);
            console.log(contracts)
            const message = Object.entries(contracts)
                .map(([exchange, networks]) => {
                    const networkInfo = Object.entries(networks)
                        .map(([network, contract]) => `  ${network}: ${contract}`)
                        .join('\n');
                    return `${exchange}:\n${networkInfo}`;
                })
                .join('\n\n');
            
            ctx.reply(`Контракты для ${token}:\n\n${message}`);
        } catch (error) {
            ctx.reply(`Ошибка при получении контрактов: ${error}`);
        }
    });
  }

  private setupTrackingCommands() {
    this.bot.command("track", (ctx: Context) => this.handleTrackCommand(ctx));
    this.bot.command("stop", (ctx: Context) => this.handleStopCommand(ctx));
    this.bot.command("stopall", (ctx: Context) =>
      this.handleStopAllCommand(ctx)
    );
    this.bot.command("list", (ctx: Context) => this.handleListCommand(ctx));
  }

  private setupCallbackQueries() {
    this.bot.action(/track_(.+)_(\w+)_(\w+)/, (ctx: Context) => {
      // Реализация обработки callback-запросов
    });
  }

  private handlePairsCommand(ctx: Context) {
    const buttons = this.commonPairs.flatMap((pair) => [
      Markup.button.callback(`${pair} SPOT-SPOT`, `track_${pair}_spot_spot`),
      Markup.button.callback(`${pair} SPOT-FUT`, `track_${pair}_spot_futures`),
      Markup.button.callback(
        `${pair} FUT-FUT`,
        `track_${pair}_futures_futures`
      ),
    ]);

    ctx.reply("Выберите пару и тип рынка для отслеживания:", {
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
      disable_web_page_preview: true,
    } as any);
  }

  private async handleTrackCommand(ctx: Context) {
    const message = ctx.message as any;
    const args = message?.text?.split(" ");
    const username = ctx.from?.username || 'unknown';
    const userId = ctx.from?.id || 0;

    logger.debug('Track command received', { 
        username, 
        userId, 
        args,
        MarketType: JSON.stringify(MarketType) // Проверим, что MarketType определен
    });

    if (!args || args.length < 2) {
        logger.debug(`User @${username} (${userId}) attempted to track without symbol`);
        ctx.reply(MessageFormatter.formatTrackCommandHelp());
        return;
    }

    const symbol = this.formatSymbol(args[1]);

    // Логируем начало отслеживания
    logger.info(`New tracking request`, {
        username,
        userId,
        symbol,
        params: args.slice(2).join(' ')
    });

    let selectedExchanges = [...EXCHANGES.DEFAULT];
    let minSpread = 1.0;

    // Проверяем, указаны ли биржи
    if (args[2]) {
        const exchangeArg = args[2].toLowerCase();
        if (exchangeArg === "all") {
            selectedExchanges = [...EXCHANGES.ALL];
        } else if (exchangeArg === "cex") {
            selectedExchanges = [...EXCHANGES.CEX];
        } else {
            const exchanges = exchangeArg.split(",");
            if (exchanges.every(isValidExchange)) {
                selectedExchanges = exchanges;
            } else {
                logger.warn(`Invalid exchanges specified by @${username}`, {
                    userId,
                    exchanges: exchangeArg
                });
                ctx.reply(MessageFormatter.formatInvalidExchangesMessage());
                return;
            }
        }
    }

    // Проверяем минимальный спред
    if (args[3]) {
        const spread = parseFloat(args[3]);
        if (!isNaN(spread) && spread > 0) {
            minSpread = spread;
        } else {
            logger.warn(`Invalid spread specified by @${username}`, {
                userId,
                spread: args[3]
            });
            ctx.reply(MessageFormatter.formatInvalidSpreadMessage());
            return;
        }
    }

    try {
        if (!ctx.chat) {
            throw new Error("Chat context is undefined");
        }

        const trackingParams = {
            chatId: ctx.chat.id,
            symbol,
            market1Type: MarketType.SPOT,
            market2Type: MarketType.SPOT,
            selectedExchanges,
            minSpreadPercent: minSpread,
            isUltraMode: true,
            minChange: config.spread.minChange,
        };

        logger.debug('Starting tracking with params:', trackingParams);

        await this.trackingManager.startTracking(trackingParams);

        logger.info(`Tracking started successfully`, {
            username,
            userId,
            symbol,
            exchanges: selectedExchanges.join(','),
            minSpread,
            chatId: ctx.chat.id
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error starting tracking for @${username}`, {
            userId,
            symbol,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        });
        ctx.reply(`Ошибка при запуске отслеживания: ${errorMessage}`);
    }
}

  private formatSymbol(symbol: string): string {
    if (!symbol.includes("/")) {
      const match = symbol.match(/^([A-Za-z]+)(USDT)$/);
      if (match) {
        return `${match[1]}/USDT`;
      }
    }
    return symbol.toUpperCase();
  }

  private async handleStopCommand(ctx: Context) {
    const message = ctx.message as any;
    const args = message?.text?.split(" ");
    const username = ctx.from?.username || 'unknown';
    const userId = ctx.from?.id || 0;

    if (!args || args.length < 2) {
        logger.debug(`User @${username} (${userId}) attempted to stop without symbol`);
        ctx.reply("Пожалуйста, укажите символ для остановки отслеживания.\nПример: /stop BTC/USDT");
        return;
    }

    const symbol = this.formatSymbol(args[1]);

    logger.info(`Stop tracking request`, {
        username,
        userId,
        symbol
    });

    try {
      if (!ctx.chat) {
        throw new Error("Chat context is undefined");
      }

      const trackings = this.trackingManager.getTrackingMap().get(ctx.chat.id);
      if (!trackings || trackings.size === 0) {
        ctx.reply("У вас нет активных отслеживаний");
        return;
      }

      // Ищем все отслеживания для данного символа
      const trackingKeys = Array.from(trackings.keys()).filter((key) =>
        key.startsWith(symbol)
      );

      if (trackingKeys.length === 0) {
        ctx.reply(`Отслеживание для ${symbol} не найдено`);
        return;
      }

      // Останавливаем все найденные отслеживания
      for (const key of trackingKeys) {
        await this.trackingManager.stopTracking(ctx.chat.id, key);
      }

      ctx.reply(`✅ Отслеживание ${symbol} остановлено`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error stopping tracking for ${symbol}:`, {
        error: errorMessage,
      });
      ctx.reply(`Ошибка при остановке отслеживания: ${errorMessage}`);
    }
  }

  private async handleStopAllCommand(ctx: Context) {
    const username = ctx.from?.username || 'unknown';
    const userId = ctx.from?.id || 0;

    logger.info(`Stop all trackings request`, {
        username,
        userId
    });

    try {
      if (!ctx.chat) {
        throw new Error("Chat context is undefined");
      }

      const trackings = this.trackingManager.getTrackingMap().get(ctx.chat.id);
      if (!trackings || trackings.size === 0) {
        ctx.reply("У вас нет активных отслеживаний");
        return;
      }

      await this.trackingManager.stopAllTracking(ctx.chat.id);
      ctx.reply("✅ Все отслеживания остановлены");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error stopping all trackings:", { error: errorMessage });
      ctx.reply(`Ошибка при остановке отслеживаний: ${errorMessage}`);
    }
  }

  private async handleListCommand(ctx: Context) {
    const username = ctx.from?.username || 'unknown';
    const userId = ctx.from?.id || 0;

    logger.debug(`List request from @${username}`, {
        userId
    });

    try {
      if (!ctx.chat) {
        throw new Error("Chat context is undefined");
      }

      const trackings = this.trackingManager.getTrackingMap().get(ctx.chat.id);
      if (!trackings || trackings.size === 0) {
        ctx.reply("У вас нет активных отслеживаний");
        return;
      }

      let message = "📋 Активные отслеживания:\n\n";

      for (const [key, tracking] of trackings) {
        // Получаем последний спред для пары
        try {
          const prices = await this.spreadService.getAllPrices(
            tracking.symbol,
            tracking.selectedExchanges
          );
          const analyzedData = PriceAnalyzer.analyzePrices(
            prices.map((price) => ({
              ...price,
              symbol: tracking.symbol,
            }))
          );

          const { bestAsk, bestBid, currentSpread } = analyzedData;

          message += `${tracking.symbol}: ${currentSpread.toFixed(2)}%\n`;
          message += `${bestAsk.exchange}(${bestAsk.marketType}) ➜ ${bestBid.exchange}(${bestBid.marketType})\n\n`;
        } catch (error) {
          message += `${tracking.symbol}: ошибка получения данных\n\n`;
        }
      }

      ctx.reply(message);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error listing trackings:", { error: errorMessage });
      ctx.reply(`Ошибка при получении списка отслеживаний: ${errorMessage}`);
    }
  }

  async handleTrackLinkCommand(ctx: Context): Promise<void> {
    try {
      if (!ctx.message || !isTextMessage(ctx.message) || !ctx.chat?.id) {
        throw new Error('Invalid message context');
      }

      const [_, url, minSpread] = ctx.message.text.split(' ');
      
      if (!url || !minSpread) {
        await ctx.reply(
          'Пожалуйста, укажите ссылку и минимальный спред %\n' +
          'Пример: /track_link https://www.mexc.com/exchange/BTC_USDT 1.5'
        );
        return;
      }

      const parsedLink = LinkParser.parse(url);
      if (!parsedLink) {
        await ctx.reply('Неверный формат ссылки или биржа не поддерживается');
        return;
      }

      await this.trackingManager.startTracking({
        chatId: ctx.chat.id,
        symbol: parsedLink.symbol,
        market1Type: parsedLink.marketType,
        market2Type: parsedLink.marketType,
        selectedExchanges: [parsedLink.exchange],
        minSpreadPercent: Number(minSpread),
        isUltraMode: false,
        minChange: 1
      });

      await ctx.reply(
        `✅ Начато отслеживание ${parsedLink.symbol} на ${parsedLink.exchange}\n` +
        `Тип рынка: ${parsedLink.marketType}\n` +
        `Минимальный спред: ${minSpread}%`
      );

    } catch (error: any) {
      logger.error('Error in handleTrackLinkCommand:', { error: error.message });
      await ctx.reply(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  async handleStopLinkCommand(ctx: Context): Promise<void> {
    try {
      if (!ctx.message || !isTextMessage(ctx.message) || !ctx.chat?.id) {
        throw new Error('Invalid message context');
      }

      const [_, url] = ctx.message.text.split(' ');
      
      if (!url) {
        await ctx.reply('Пожалуйста, укажите ссылку для остановки отслеживания');
        return;
      }

      const parsedLink = LinkParser.parse(url);
      if (!parsedLink) {
        await ctx.reply('Неверный формат ссылки');
        return;
      }

      await this.trackingManager.stopTracking(ctx.chat.id, parsedLink.symbol);

      await ctx.reply(`Отслеживание ${parsedLink.symbol} остановлено`);
    } catch (error: any) {
      logger.error('Error in handleStopLinkCommand:', { error: error.message });
      await ctx.reply(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  async handleStartCommand(ctx: Context): Promise<void> {
    await ctx.reply(MessageFormatter.formatStartMessage());
  }

  async handleHelpCommand(ctx: Context): Promise<void> {
    await ctx.reply(MessageFormatter.formatHelpMessage());
  }

  async handleTrackPairCommand(ctx: Context): Promise<void> {
    try {
      if (!ctx.message || !isTextMessage(ctx.message) || !ctx.chat?.id) {
        throw new Error('Invalid message context');
      }

      const [_, url1, url2, minSpread, maxSpread] = ctx.message.text.split(' ');
      
      if (!url1 || !url2 || !minSpread || !maxSpread) {
        await ctx.reply(
          'Пожалуйста, укажите две ссылки и диапазон спреда %\n' +
          'Пример: /track_pair https://mexc.com/BTC_USDT https://gate.io/BTC_USDT 1.5 3.0'
        );
        return;
      }

      const parsedLink1 = LinkParser.parse(url1);
      const parsedLink2 = LinkParser.parse(url2);

      if (!parsedLink1 || !parsedLink2) {
        await ctx.reply('Неверный формат ссылок или биржи не поддерживаются');
        return;
      }

      if (parsedLink1.symbol !== parsedLink2.symbol) {
        await ctx.reply('Ссылки должны вести на одну и ту же торговую пару');
        return;
      }

      // Используем существующий механизм отслеживания
      await this.trackingManager.startTracking({
        chatId: ctx.chat.id,
        symbol: parsedLink1.symbol,
        market1Type: parsedLink1.marketType,
        market2Type: parsedLink2.marketType,
        selectedExchanges: [parsedLink1.exchange, parsedLink2.exchange],
        minSpreadPercent: Number(minSpread),
        maxSpreadPercent: Number(maxSpread),
        isUltraMode: false,
        minChange: 0.1
      });

      await ctx.reply(
        `✅ Начато отслеживание ${parsedLink1.symbol}\n` +
        `${parsedLink1.exchange}(${parsedLink1.marketType}) ↔️ ${parsedLink2.exchange}(${parsedLink2.marketType})\n` +
        `Диапазон спреда: ${minSpread}% - ${maxSpread}%`
      );

    } catch (error: any) {
      logger.error('Error in handleTrackPairCommand:', { error: error.message });
      await ctx.reply(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
  }
}
