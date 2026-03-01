import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TwitchBot } from './bot.js';

describe('TwitchBot.parseCommand', () => {
    // Instantiate without credentials → noop mode, but parseCommand still works
    const bot = new TwitchBot();

    it('parses !press command', () => {
        const result = bot.parseCommand('!press 2', 'viewer1');
        assert.ok(result, 'should return a command');
        assert.equal(result.action, 'press');
        assert.equal(result.params.statementNumber, 2);
        assert.equal(result.username, 'viewer1');
    });

    it('parses !present command', () => {
        const result = bot.parseCommand('!present banana', 'viewer2');
        assert.ok(result, 'should return a command');
        assert.equal(result.action, 'present');
        assert.equal(result.params.evidenceId, 'banana');
    });

    it('returns null for unknown command', () => {
        const result = bot.parseCommand('!unknown', 'viewer3');
        assert.equal(result, null);
    });

    it('returns null for non-command message', () => {
        const result = bot.parseCommand('hello world', 'viewer4');
        assert.equal(result, null);
    });

    it('rate-limits duplicate commands from same user', () => {
        // First command allowed
        const first = bot.parseCommand('!press 1', 'spammer');
        assert.ok(first);
        // Same command within duplicate window → blocked
        const second = bot.parseCommand('!press 1', 'spammer');
        assert.equal(second, null, 'duplicate should be rate-limited');
    });
});
