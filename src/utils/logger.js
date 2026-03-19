// src/utils/logger.js
const winston = require('winston');

const fmt = winston.format;

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fmt.combine(
    fmt.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    fmt.errors({ stack: true }),
    fmt.json()
  ),
  transports: [
    new winston.transports.Console({
      format: fmt.combine(
        fmt.colorize(),
        fmt.printf(({ timestamp, level, message, ...meta }) => {
          const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `[${timestamp}] ${level}: ${message}${extras}`;
        })
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log',  level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = { logger };
