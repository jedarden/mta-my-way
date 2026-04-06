/**
 * Structured logging utility.
 *
 * Provides JSON-formatted logging with levels and context support.
 * Compatible with pino for production (can be swapped in).
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Logger configuration.
 */
interface LoggerConfig {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Include timestamp in logs */
  timestamp?: boolean;
  /** Include hostname in logs */
  hostname?: boolean;
  /** Include PID in logs */
  pid?: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  timestamp: true,
  hostname: false,
  pid: false,
};

class Logger {
  private config: Required<LoggerConfig>;
  private hostname: string;

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<LoggerConfig>;
    this.hostname = "";
  }

  /**
   * Format log entry as JSON.
   */
  private format(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (context) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as unknown as { code?: string }).code,
      };
    }

    return entry;
  }

  /**
   * Output log to console.
   */
  private output(entry: LogEntry): void {
    const levelPriority = {
      [LogLevel.DEBUG]: 10,
      [LogLevel.INFO]: 20,
      [LogLevel.WARN]: 30,
      [LogLevel.ERROR]: 40,
    };

    const currentLevel = levelPriority[this.config.level];
    const entryLevel = levelPriority[entry.level];

    if (entryLevel < currentLevel) {
      return;
    }

    const output = JSON.stringify(entry);
    const consoleMethod =
      entry.level === LogLevel.ERROR
        ? console.error
        : entry.level === LogLevel.WARN
          ? console.warn
          : console.log;

    consoleMethod(output);
  }

  /**
   * Log at debug level.
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.output(this.format(LogLevel.DEBUG, message, context));
  }

  /**
   * Log at info level.
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.output(this.format(LogLevel.INFO, message, context));
  }

  /**
   * Log at warn level.
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.output(this.format(LogLevel.WARN, message, context));
  }

  /**
   * Log at error level.
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.output(this.format(LogLevel.ERROR, message, context, error));
  }

  /**
   * Create a child logger with additional context.
   */
  child(additionalContext: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    const originalOutput = child.output.bind(child);
    child.output = (entry: LogEntry) => {
      entry.context = { ...additionalContext, ...entry.context };
      originalOutput(entry);
    };
    return child;
  }
}

/**
 * Default logger instance.
 */
export const logger = new Logger();

/**
 * Create a new logger instance.
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}
