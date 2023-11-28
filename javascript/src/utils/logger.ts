const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = typeof LOG_LEVELS[number]

const LOG_LEVEL_RANKINGS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

type LoggerOptions = {
  logLevel?: LogLevel
}

interface LogFn {
  (...messages: any[]): void;
}

export type LoggerService = Record<LogLevel, LogFn>;

export class Logger implements LoggerService {
  private currentLogLevel: LogLevel

  constructor(options: LoggerOptions) {
    this.currentLogLevel = options.logLevel || 'info' // Default to 'info' if logLevel is not specified
  }

  private shouldLog(level: LogLevel) {
    return LOG_LEVEL_RANKINGS[level] >= LOG_LEVEL_RANKINGS[this.currentLogLevel] && process.env.NODE_ENV !== 'test'
  }

  debug(...messages: any[]) {
    if (this.shouldLog('debug')) {
      console.log(...messages)
    }
  }

  info(...messages: any[]) {
    if (this.shouldLog('info')) {
      console.log(...messages)
    }
  }

  warn(...messages: any[]) {
    if (this.shouldLog('warn')) {
      console.log(...messages)
    }
  }

  error(...messages: any[]) {
    if (this.shouldLog('error')) {
      console.log(...messages)
    }
  }
}
