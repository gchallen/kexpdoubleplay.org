import winston from 'winston';

// Check for --debug flag in command line arguments
const debugMode = process.argv.includes('--debug');
const progressMode = process.argv.includes('--progress');
const logLevel = debugMode ? 'debug' : (process.env.LOG_LEVEL || 'info');
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'kexp-doubleplay-scanner',
    version: '1.0.0'
  },
  transports: [
    // Console output with color in development (suppressed during progress mode)
    new winston.transports.Console({
      silent: progressMode, // Suppress console logging when progress bars are active
      format: isDevelopment 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              // Format metadata more readably, don't truncate
              let metaStr = '';
              if (Object.keys(meta).length) {
                // Special handling for error metadata to make it more readable
                const formattedMeta = { ...meta };
                
                // Don't show stack traces in console (they're in the log files)
                delete formattedMeta.stack;
                
                // Format the metadata nicely
                metaStr = ` ${JSON.stringify(formattedMeta, null, 0)}`;
              }
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          )
        : winston.format.json()
    }),
    
    // File output for errors
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.json()
    }),
    
    // File output for all logs  
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.json()
    })
  ]
});

// Create logs directory if it doesn't exist
import * as fs from 'fs';
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Add request ID tracking for HTTP requests
export const withRequestId = (requestId: string) => {
  return logger.child({ requestId });
};

export default logger;