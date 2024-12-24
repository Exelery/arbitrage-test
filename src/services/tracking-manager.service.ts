import { Telegraf } from "telegraf";
import { TrackingInfo, TrackingParams, SetupState, MarketType } from "../types";
import { SpreadService } from "./spread.service";
import { Tracker } from "./tracker.service";
import { logger } from "./logger.service";
import { MessageFormatter } from "./message-formatter.service";

export class TrackingManager {
  private trackingMap: Map<number, Map<string, TrackingInfo>> = new Map();
  private setupStates: Map<number, SetupState> = new Map();

  constructor(
    private readonly spreadService: SpreadService,
    private readonly bot: Telegraf
  ) {}

  async startTracking(params: TrackingParams): Promise<void> {
    logger.debug('TrackingManager.startTracking called with params:', params);
    
    try {
        const tracker = new Tracker(
            this.spreadService,
            this.bot,
            params,
            (error) => this.handleTrackingError(params.chatId, params.symbol, error)
        );

        logger.debug('Tracker created, starting...');
        
        const trackingInfo = await tracker.start();
        
        logger.debug('Tracker started successfully, saving tracking info');

        // Сохраняем информацию об отслеживании
        let userTrackings = this.trackingMap.get(params.chatId);
        if (!userTrackings) {
            userTrackings = new Map();
            this.trackingMap.set(params.chatId, userTrackings);
        }

        const trackingKey = this.generateTrackingKey(params);
        userTrackings.set(trackingKey, trackingInfo);

        logger.debug('Tracking info saved successfully');
    } catch (error) {
        logger.error('Error in startTracking:', {
            error,
            stack: error instanceof Error ? error.stack : undefined,
            params
        });
        throw error;
    }
  }

  async stopTracking(chatId: number, trackingKey: string): Promise<void> {
    const userTrackings = this.trackingMap.get(chatId);
    if (!userTrackings) return;

    const tracking = userTrackings.get(trackingKey);
    if (tracking) {
      clearInterval(tracking.interval);
      userTrackings.delete(trackingKey);
      await this.saveState();
    }
  }

  async stopAllTracking(chatId: number): Promise<void> {
    const userTrackings = this.trackingMap.get(chatId);
    if (!userTrackings) return;

    for (const [key, tracking] of userTrackings.entries()) {
      clearInterval(tracking.interval);
      userTrackings.delete(key);
    }

    this.trackingMap.delete(chatId);
    await this.saveState();
  }

  private getUserTrackings(chatId: number): Map<string, TrackingInfo> {
    let userTrackings = this.trackingMap.get(chatId);
    if (!userTrackings) {
      userTrackings = new Map();
      this.trackingMap.set(chatId, userTrackings);
    }
    return userTrackings;
  }

  private generateTrackingKey(params: TrackingParams): string {
    return `${params.symbol}_${params.market1Type}_${params.market2Type}${
      params.isUltraMode ? "_ultra" : ""
    }`;
  }

  private async handleTrackingError(chatId: number, symbol: string, error: Error): Promise<void> {
    logger.error(`Error in tracking`, { chatId, symbol, error: error.message });
    await this.bot.telegram.sendMessage(
      chatId,
      MessageFormatter.formatErrorMessage(symbol, error.message)
    );
  }

  private async saveState(): Promise<void> {
    // Реализация сохранения состояния
  }

  getSetupState(chatId: number): SetupState | undefined {
    return this.setupStates.get(chatId);
  }

  setSetupState(chatId: number, state: SetupState): void {
    this.setupStates.set(chatId, state);
  }

  clearSetupState(chatId: number): void {
    this.setupStates.delete(chatId);
  }

  public getTrackingMap(): Map<number, Map<string, TrackingInfo>> {
    return this.trackingMap;
  }

  public async saveStatePublic(): Promise<void> {
    await this.saveState();
  }
}