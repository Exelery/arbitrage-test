import { SpreadService } from './services/spread.service';
import { TelegramService } from './services/telegram.service';
import { config } from './config/config';
import { logger } from './services/logger.service';


async function main() {
  try {
    logger.info('Starting application...');
    
    const spreadService = new SpreadService(config);
    const telegramService = TelegramService.getInstance(spreadService);

    // Обработчик остановки
    const handleShutdown = async () => {
      logger.info('Shutting down application...');
      if (config.telegramNotifications.enabled) {
        // await telegramService.sendMessage('Бот остановлен 🔴');
      }
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Запускаем телеграм бота
    await telegramService.launch();
    logger.info('Telegram bot started successfully');

    // const linkTracker = new LinkTrackerService(spreadService, telegramService.bot);
    // setupLinkCommands(telegramService.bot, linkTracker);
  } catch (error: any) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

// Запускаем приложение
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 