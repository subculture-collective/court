import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Logger, createLogger } from './logger.js';

describe('Logger', () => {
    it('should create logger with default info level', () => {
        const logger = new (Logger as any)();
        assert.equal(logger.minLevel, 'info');
    });

    it('should respect log level hierarchy', () => {
        const logger = new (Logger as any)('warn');

        // Mock console methods
        const logs: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;

        console.log = (msg: string) => logs.push(msg);
        console.error = (msg: string) => logs.push(msg);

        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');

        // Restore console
        console.log = originalLog;
        console.error = originalError;

        // Only warn and error should be logged
        assert.equal(logs.length, 2);
        assert.ok(logs[0].includes('warn message'));
        assert.ok(logs[1].includes('error message'));
    });

    it('should include context in log entries', () => {
        const logger = new (Logger as any)('debug');

        let capturedLog = '';
        const originalLog = console.log;
        console.log = (msg: string) => {
            capturedLog = msg;
        };

        logger.info('test message', {
            sessionId: 'sess123',
            phase: 'WITNESS_1',
        });

        console.log = originalLog;

        const parsed = JSON.parse(capturedLog);
        assert.equal(parsed.message, 'test message');
        assert.equal(parsed.context.sessionId, 'sess123');
        assert.equal(parsed.context.phase, 'WITNESS_1');
        assert.ok(parsed.timestamp);
    });

    it('should create child logger with base context', () => {
        const logger = new (Logger as any)('debug');
        const childLogger = logger.child({ sessionId: 'sess456' });

        let capturedLog = '';
        const originalLog = console.log;
        console.log = (msg: string) => {
            capturedLog = msg;
        };

        childLogger.info('child message', { eventType: 'PHASE_START' });

        console.log = originalLog;

        const parsed = JSON.parse(capturedLog);
        assert.equal(parsed.context.sessionId, 'sess456');
        assert.equal(parsed.context.eventType, 'PHASE_START');
    });

    it('should write errors to stderr', () => {
        const logger = new (Logger as any)('error');

        let capturedError = '';
        const originalError = console.error;
        console.error = (msg: string) => {
            capturedError = msg;
        };

        logger.error('error message');

        console.error = originalError;

        assert.ok(capturedError.includes('error message'));
        const parsed = JSON.parse(capturedError);
        assert.equal(parsed.level, 'error');
    });
});
