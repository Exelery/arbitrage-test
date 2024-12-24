import { Telegraf } from "telegraf";
import { SpreadService } from "./spread.service";
import { config } from "../config/config";
import { logger } from "./logger.service";
import { MessageFormatter } from "./message-formatter.service";
import { TrackingManager } from "./tracking-manager.service";
import { CommandHandler } from "./command-handler.service";

export class TelegramService {
  private static instance: TelegramService | null = null;
  private bot: Telegraf;
  private trackingManager: TrackingManager;
  private commandHandler: CommandHandler;
  private isRestarting: boolean = false;

  private constructor(private readonly spreadService: SpreadService) {
    this.bot = new Telegraf(config.telegram.token);
    this.trackingManager = new TrackingManager(spreadService, this.bot);
    this.commandHandler = new CommandHandler(
      this.trackingManager,
      this.bot,
      spreadService
    );
    
    this.initialize();
  }

  public static getInstance(spreadService: SpreadService): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService(spreadService);
    }
    return TelegramService.instance;
  }

  public static clearInstance(): void {
    TelegramService.instance = null;
  }

  private initialize() {
    this.initGracefulShutdown();
    this.commandHandler.setupCommands();
    this.initBotCommands();
  }

  private async initBotCommands() {
    await this.bot.telegram.setMyCommands([
      { command: "start", description: "Запустить бота" },
      { command: "help", description: "Показать справку" },
      { command: "track", description: "Начать отслеживание пары" },
      { command: "stop", description: "Остановить отслеживание пары" },
      { command: "stopall", description: "Остановить все отслеживания" },
      { command: "list", description: "Список отслеживаемых пар" },
      { command: "pairs", description: "Популярные торговые пары" },
      { command: "track_link", description: "Отслеживать по ссылке" },
      { command: "stop_link", description: "Остановить отслеживание по ссылке" },
      { 
        command: "track_pair", 
        description: "Отслеживать спред между двумя ссылками" 
      },
    ]);
  }

  private initGracefulShutdown() {
    process.once("SIGUSR2", async () => {
      logger.info("Received SIGUSR2 signal, preparing for restart...");
      await this.prepareForRestart();
    });

    process.once("SIGTERM", async () => {
      logger.info("Received SIGTERM signal, shutting down...");
      await this.shutdown();
    });

    process.once("SIGINT", async () => {
      logger.info("Received SIGINT signal, shutting down...");
      await this.shutdown();
    });
  }

  private async prepareForRestart() {
    this.isRestarting = true;
    await this.trackingManager.saveStatePublic();
    await this.sendMessage(MessageFormatter.formatRestartMessage());
    await this.bot.stop();
    process.exit(0);
  }

  private async shutdown() {
    if (this.isRestarting) return;
    await this.trackingManager.saveStatePublic();
    await this.sendMessage('Бот остановлен 🔴');
    await this.bot.stop();
    process.exit(0);
  }

  async sendMessage(message: string): Promise<void> {
    if (config.telegramNotifications.enabled) {
      const activeChats = Array.from(this.trackingManager.getTrackingMap().keys());
      const promises = activeChats.map(chatId =>
        this.bot.telegram.sendMessage(chatId, message, { 
          parse_mode: 'HTML',
          disable_web_page_preview: true 
        } as any)
      );
      await Promise.all(promises);
    }
  }

  private async sendStartupMessages() {
    await this.sendMessage(MessageFormatter.formatStartMessage());
  }

  async launch() {
    try {
      await this.bot.launch();
      logger.info("Telegram bot started");
      await this.sendStartupMessages();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Failed to launch bot:", { error: error.message });
      }
      throw error;
    }
  }

  private setupCommands(): void {
    this.bot.command('start', (ctx) => this.commandHandler.handleStartCommand(ctx));
    this.bot.command('help', (ctx) => this.commandHandler.handleHelpCommand(ctx));
    // ... существующие команды ...
    
    // Добавляем новые команды
    this.bot.command('track_link', (ctx) => this.commandHandler.handleTrackLinkCommand(ctx));
    this.bot.command('stop_link', (ctx) => this.commandHandler.handleStopLinkCommand(ctx));
  }
}
