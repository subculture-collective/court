/**
 * Structured logging service for Improv Court
 * Provides JSON-formatted logs with session/phase/event correlation
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = {
    sessionId?: string;
    phase?: string;
    eventType?: string;
    userId?: string;
    [key: string]: unknown;
};

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export class Logger {
    private minLevel: LogLevel;

    constructor(minLevel: LogLevel = 'info') {
        this.minLevel = minLevel;
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
    }

    private write(
        level: LogLevel,
        message: string,
        context?: LogContext,
    ): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context,
        };

        const output = JSON.stringify(entry);

        // Write to appropriate stream based on level
        if (level === 'error' || level === 'warn') {
            console.error(output);
        } else {
            console.log(output);
        }
    }

    debug(message: string, context?: LogContext): void {
        this.write('debug', message, context);
    }

    info(message: string, context?: LogContext): void {
        this.write('info', message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.write('warn', message, context);
    }

    error(message: string, context?: LogContext): void {
        this.write('error', message, context);
    }

    // Convenience method to create a child logger with base context
    child(baseContext: LogContext): Logger {
        const parent = this;
        const childLogger = Object.create(Logger.prototype);

        childLogger.minLevel = this.minLevel;

        // Override write to check child's own minLevel and merge contexts.
        // This ensures setLevel() on the child has the expected effect.
        childLogger.write = (
            level: LogLevel,
            message: string,
            context?: LogContext,
        ) => {
            if (LOG_LEVELS[level] < LOG_LEVELS[childLogger.minLevel]) return;
            const mergedContext = { ...baseContext, ...context };
            parent.write(level, message, mergedContext);
        };

        return childLogger;
    }

    setLevel(level: LogLevel): void {
        this.minLevel = level;
    }
}

// Create singleton logger instance
const rawLogLevel = process.env.LOG_LEVEL;
const logLevel: LogLevel =
    rawLogLevel && rawLogLevel in LOG_LEVELS ?
        (rawLogLevel as LogLevel)
    :   'info';
export const logger = new Logger(logLevel);

// Export convenience function for creating child loggers
export function createLogger(context: LogContext): Logger {
    return logger.child(context);
}
