import winston from 'winston';
import path from 'path';
import { config } from '../config/config';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

class LoggerService {
  private logger: winston.Logger;

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');

    const transports: winston.transport[] = [];

    // Консольный вывод
    if (config.logging.console) {
      transports.push(
        new winston.transports.Console({
          level: config.logging.level,
          format: combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
          ),
        })
      );
    }

    // Файловые логи
    if (config.logging.file) {
      transports.push(
        // Файл с ошибками
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
        }),
        // Файл со всеми логами
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          level: config.logging.level,
        }),
        // Файл с логами спредов
        new winston.transports.File({
          filename: path.join(logsDir, 'spreads.log'),
          level: 'info',
        })
      );
    }

    this.logger = winston.createLogger({
      level: config.logging.level,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
      transports,
    });

    this.logger.debug('Logger initialized with level: ' + config.logging.level);
  }

  info(message: string, metadata: object = {}) {
    this.logger.info(message, metadata);
  }

  error(message: string, metadata: object = {}) {
    this.logger.error(message, metadata);
  }

  warn(message: string, metadata: object = {}) {
    this.logger.warn(message, metadata);
  }

  debug(message: string, metadata: object = {}) {
    this.logger.debug(message, metadata);
  }

  logSpread(spreadData: any, chatId: number) {
    this.info('Spread Update', {
      chatId,
      ...spreadData,
      timestamp: new Date().toISOString(),
    });
  }
}

export const logger = new LoggerService(); 