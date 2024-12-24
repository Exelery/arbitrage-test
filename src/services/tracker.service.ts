import { Telegraf } from "telegraf";
import { TrackingParams, TrackingInfo, SpreadData } from "../types";
import { SpreadService } from "./spread.service";
import { config } from "../config/config";
import { MessageFormatter } from "./message-formatter.service";
import { logger } from "./logger.service";
import { PriceAnalyzer } from "./price-analyzer.service";

export class Tracker {
  private lastMaxSpread: number | null = null;
  private lastSpreadData: SpreadData | null = null;
  private readonly symbol: string;
  private readonly selectedExchanges: string[];
  private readonly minSpreadPercent: number;
  private readonly maxSpreadPercent?: number;
  private readonly chatId: number;

  constructor(
    private readonly spreadService: SpreadService,
    private readonly bot: Telegraf,
    private readonly params: TrackingParams,
    private readonly onError: (error: Error) => void
  ) {
    this.symbol = params.symbol;
    this.selectedExchanges = params.selectedExchanges;
    this.minSpreadPercent = params.minSpreadPercent;
    this.maxSpreadPercent = params.maxSpreadPercent;
    this.chatId = params.chatId;
  }

  async start(): Promise<TrackingInfo> {
    logger.debug("Tracker.start called with params:", this.params);

    try {
      // Получаем актуальные символы для всех бирж
      //   const actualSymbols = await this.spreadService.getActualSymbols(
      //     this.params.symbol,
      //     this.params.selectedExchanges
      //   );

      await this.sendInitialMessage();
      await this.sendUpdate().catch(this.onError);

      logger.debug("First update completed successfully");

      const interval = setInterval(async () => {
        try {
          await this.sendUpdate();
        } catch (error) {
          this.onError(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }, config.updateInterval);

      const trackingInfo: TrackingInfo = {
        interval,
        lastSpreadData: null,
        selectedExchanges: this.params.selectedExchanges,
        minSpreadPercent: this.params.minSpreadPercent,
        isUltraMode: this.params.isUltraMode,
        symbol: this.params.symbol,
        minChange: this.params.minChange,
        market1Type: this.params.market1Type,
        market2Type: this.params.market2Type,
        // actualSymbols
      };

      return trackingInfo;
    } catch (error) {
      logger.error("Error in Tracker.start:", {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        params: this.params,
      });
      throw error;
    }
  }

  private async sendInitialMessage(): Promise<void> {
    // const actualSymbols = await this.spreadService.getActualSymbols(
    //   this.params.symbol,
    //   this.params.selectedExchanges
    // );

    await this.bot.telegram.sendMessage(
      this.params.chatId,
      MessageFormatter.formatTrackingStartMessage(
        this.params.symbol,
        this.params.isUltraMode,
        this.params.market1Type,
        this.params.market2Type,
        this.params.selectedExchanges,
        this.params.minSpreadPercent,
        this.params.minChange
        // actualSymbols
      )
    );
  }

  private async sendUpdate(): Promise<void> {
    if (this.params.isUltraMode) {
      await this.sendUltraModeUpdate();
    } else {
      await this.sendRegularUpdate();
    }
  }

  private async sendUltraModeUpdate(): Promise<void> {
    try {
      const prices = await this.spreadService.getAllPrices(
        this.params.symbol,
        this.params.selectedExchanges
      );

      const pricesWithSymbol = prices.map((price) => ({
        ...price,
        // symbol: this.params.symbol,
      }));

      const analyzedData = PriceAnalyzer.analyzePrices(pricesWithSymbol);
    //   console.log('analyzedData', JSON.stringify(analyzedData, null, 2))

      if (await this.shouldSendUpdate(analyzedData.currentSpread)) {
       
        const { message, maxSpread } = MessageFormatter.formatUltraModeMessage(
          analyzedData,
          this.lastMaxSpread,
          this.spreadService.getExchange("dexscreener")
        );

        await this.bot.telegram.sendMessage(this.params.chatId, message, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        } as any);

        this.lastMaxSpread = maxSpread;
        logger.debug(`Updated lastMaxSpread to ${maxSpread}`);
      }
    } catch (error: any) {
      logger.error("Error in sendUltraModeUpdate:", error);
      throw error;
    }
  }

  private async sendRegularUpdate(): Promise<void> {
    // Реализация обычного обновления
  }

  private async shouldSendUpdate(currentSpread?: number): Promise<boolean> {
    if (this.lastMaxSpread === null) {
      this.lastMaxSpread = currentSpread!;
      return true;
    }

    if (this.params.isUltraMode) {
      if (currentSpread !== undefined) {
        // Проверяем изменение спреда
        const spreadChange = Math.abs(currentSpread - this.lastMaxSpread);

        // Отправляем сообщение только если:
        // 1. Изменение спреда больше или равно минимальному изменению из конфига
        // 2. Текущий спред больше минимального значения из конфига или из параметров
        const minSpreadValue = Math.max(
          config.spread.minValue,
          this.params.minSpreadPercent
        );

        if (
          spreadChange >= config.spread.minChange &&
          currentSpread >= minSpreadValue
        ) {
          logger.debug(
            `Sending update: spreadChange=${spreadChange}, currentSpread=${currentSpread}, minSpreadChange=${config.spread.minChange}, minSpreadValue=${minSpreadValue}`
          );
          return true;
        }

        logger.debug(
          `Skipping update: spreadChange=${spreadChange}, currentSpread=${currentSpread}, minSpreadChange=${config.spread.minChange}, minSpreadValue=${minSpreadValue}`
        );
        return false;
      }

      // Если currentSpread не передан, получаем цены и считаем спред
      const prices = await this.spreadService.getAllPrices(
        this.params.symbol,
        this.params.selectedExchanges
      );

      const analyzedData = PriceAnalyzer.analyzePrices(
        prices.map((price) => ({
          ...price,
          // symbol: this.params.symbol
        }))
      );

      return this.shouldSendUpdate(analyzedData.currentSpread);
    }

    return false;
  }

  private async checkAndNotify(): Promise<void> {
    try {
      const prices = await this.spreadService.getAllPrices(
        this.symbol,
        this.selectedExchanges
      );

      const analyzedData = PriceAnalyzer.analyzePrices(
        prices.map(price => ({ ...price, symbol: this.symbol }))
      );

      const { currentSpread } = analyzedData;

      const isSpreadInRange = 
        currentSpread >= this.minSpreadPercent && 
        (!this.maxSpreadPercent || currentSpread <= this.maxSpreadPercent);

      if (isSpreadInRange) {
        const message = MessageFormatter.formatUltraModeMessage(
          analyzedData,
          this.lastSpreadData?.spreadPercentage || null
        );

        await this.bot.telegram.sendMessage(this.chatId, message.message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true as any
        });

        this.lastSpreadData = {
          symbol: this.symbol,
          exchange1: analyzedData.bestAsk.exchange,
          exchange2: analyzedData.bestBid.exchange,
          market1Type: analyzedData.bestAsk.marketType,
          market2Type: analyzedData.bestBid.marketType,
          price1: analyzedData.bestAsk.ask,
          price2: analyzedData.bestBid.bid,
          spreadPercentage: currentSpread
        };
      }
    } catch (error: any) {
      logger.error('Error in checkAndNotify:', { error: error.message });
    }
  }
}
