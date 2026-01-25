/**
 * Structured Logger
 * 
 * Provides structured JSON logging with correlation IDs, context, and log levels.
 * Designed for CloudWatch Logs Insights queries.
 */

import { Context } from 'aws-lambda';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  requestId?: string;
  functionName?: string;
  service: string;
  component: string;
  traceId?: string;
  spanId?: string;
  duration?: number;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger context for correlation
 */
export interface LoggerContext {
  correlationId?: string;
  requestId?: string;
  functionName?: string;
  traceId?: string;
  spanId?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  service: string;
  component: string;
  minLevel?: LogLevel;
  includeStack?: boolean;
}

/**
 * Structured Logger class
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private context: LoggerContext = {};

  constructor(config: LoggerConfig) {
    this.config = {
      service: config.service,
      component: config.component,
      minLevel: config.minLevel || LogLevel.INFO,
      includeStack: config.includeStack ?? true,
    };

    // Override min level from environment
    if (process.env.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toUpperCase() as LogLevel;
      if (envLevel in LogLevel) {
        this.config.minLevel = envLevel;
      }
    }
  }

  /**
   * Set context from Lambda context
   */
  setLambdaContext(lambdaContext: Context): void {
    this.context = {
      requestId: lambdaContext.awsRequestId,
      functionName: lambdaContext.functionName,
    };

    // Extract X-Ray trace ID if available
    const traceHeader = process.env._X_AMZN_TRACE_ID;
    if (traceHeader) {
      const traceId = this.parseXRayTraceId(traceHeader);
      if (traceId) {
        this.context.traceId = traceId;
      }
    }
  }

  /**
   * Set custom context
   */
  setContext(context: Partial<LoggerContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Set correlation ID
   */
  setCorrelationId(correlationId: string): void {
    this.context.correlationId = correlationId;
  }

  /**
   * Create a child logger with additional context
   */
  child(component: string, additionalContext?: Partial<LoggerContext>): Logger {
    const childLogger = new Logger({
      ...this.config,
      component: `${this.config.component}.${component}`,
    });
    childLogger.context = { ...this.context, ...additionalContext };
    return childLogger;
  }

  /**
   * Parse X-Ray trace ID from header
   */
  private parseXRayTraceId(header: string): string | null {
    const match = header.match(/Root=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format and output log entry
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      component: this.config.component,
      ...this.context,
    };

    if (data) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
      };
      if (this.config.includeStack && error.stack) {
        entry.error.stack = error.stack;
      }
    }

    // Output as JSON for CloudWatch Logs
    const output = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Debug level log
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Info level log
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Warning level log
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Error level log
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  /**
   * Log with timing - returns a function to call when operation completes
   */
  startTimer(operation: string, data?: Record<string, unknown>): () => void {
    const startTime = Date.now();
    this.debug(`${operation} started`, data);

    return () => {
      const duration = Date.now() - startTime;
      this.info(`${operation} completed`, { ...data, duration });
    };
  }

  /**
   * Wrap an async function with logging
   */
  async wrap<T>(
    operation: string,
    fn: () => Promise<T>,
    data?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    this.debug(`${operation} started`, data);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.info(`${operation} completed`, { ...data, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(
        `${operation} failed`,
        error instanceof Error ? error : new Error(String(error)),
        { ...data, duration }
      );
      throw error;
    }
  }
}

/**
 * Create a logger for a component
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({
    service: 'safeart',
    component,
    ...config,
  });
}

/**
 * Default loggers for main components
 */
export const loggers = {
  jobCreator: createLogger('job-creator'),
  worker: createLogger('worker'),
  scheduler: createLogger('scheduler'),
  compliance: createLogger('compliance'),
  api: createLogger('api'),
};

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
