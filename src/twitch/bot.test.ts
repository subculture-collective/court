import { describe, it, before, after } from 'node:test';
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

describe('TwitchBot.forwardCommand routing', () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;

    // Save original env var values so we can restore them (not just delete them)
    let origChannel: string | undefined;
    let origBotToken: string | undefined;
    let origClientId: string | undefined;
    let origClientSecret: string | undefined;

    before(() => {
        origChannel = process.env.TWITCH_CHANNEL;
        origBotToken = process.env.TWITCH_BOT_TOKEN;
        origClientId = process.env.TWITCH_CLIENT_ID;
        origClientSecret = process.env.TWITCH_CLIENT_SECRET;

        // Set env vars so credential check passes when constructing with config
        process.env.TWITCH_CHANNEL = 'test';
        process.env.TWITCH_BOT_TOKEN = 'oauth:test';
        process.env.TWITCH_CLIENT_ID = 'cid';
        process.env.TWITCH_CLIENT_SECRET = 'csec';

        // Replace fetch with a recorder
        globalThis.fetch = async (url: string | Request | URL, init?: RequestInit) => {
            requests.push({
                url: String(url),
                body: JSON.parse((init?.body as string) ?? '{}'),
            });
            return { ok: true, status: 200, json: async () => ({}) } as Response;
        };
    });

    after(() => {
        // Restore original env var values
        if (origChannel === undefined) delete process.env.TWITCH_CHANNEL;
        else process.env.TWITCH_CHANNEL = origChannel;

        if (origBotToken === undefined) delete process.env.TWITCH_BOT_TOKEN;
        else process.env.TWITCH_BOT_TOKEN = origBotToken;

        if (origClientId === undefined) delete process.env.TWITCH_CLIENT_ID;
        else process.env.TWITCH_CLIENT_ID = origClientId;

        if (origClientSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET;
        else process.env.TWITCH_CLIENT_SECRET = origClientSecret;

        globalThis.fetch = originalFetch;
    });

    function makeBot(): TwitchBot {
        return new TwitchBot({
            channel: 'test',
            botToken: 'oauth:test',
            clientId: 'cid',
            clientSecret: 'csec',
            apiBaseUrl: 'http://localhost:3000',
            getActiveSessionId: async () => 'session-abc',
        });
    }

    it('!press routes to /press with statementNumber', async () => {
        requests.length = 0;
        const bot = makeBot();
        const cmd = bot.parseCommand('!press 3', 'viewer1');
        assert.ok(cmd);
        await (bot as any).forwardCommand(cmd, 'session-abc');
        assert.equal(requests.length, 1);
        assert.ok(requests[0].url.includes('/api/court/sessions/session-abc/press'));
        assert.equal((requests[0].body as any).statementNumber, 3);
    });

    it('!present routes to /present with evidenceId', async () => {
        requests.length = 0;
        const bot = makeBot();
        const cmd = bot.parseCommand('!present banana 2', 'viewer2');
        assert.ok(cmd);
        await (bot as any).forwardCommand(cmd, 'session-abc');
        assert.equal(requests.length, 1);
        assert.ok(requests[0].url.includes('/api/court/sessions/session-abc/present'));
        assert.equal((requests[0].body as any).evidenceId, 'banana');
    });

    it('!vote routes to /vote with voteType verdict', async () => {
        requests.length = 0;
        const bot = makeBot();
        const cmd = bot.parseCommand('!vote guilty', 'viewer3');
        assert.ok(cmd);
        await (bot as any).forwardCommand(cmd, 'session-abc');
        assert.equal(requests.length, 1);
        assert.ok(requests[0].url.includes('/api/court/sessions/session-abc/vote'));
        assert.equal((requests[0].body as any).voteType, 'verdict');
        assert.equal((requests[0].body as any).choice, 'guilty');
    });
});
