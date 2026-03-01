# Twitch Bot Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Twitch IRC bot actually connect and forward chat commands (`!press`, `!present`, `!vote`) to the court API, and start the bot from server.ts.

**Architecture:** Most of the plumbing is already in place: `commands.ts` (full parser), `eventsub.ts` (webhook validation + redemption handling), `command-rate-limit.ts`, and all three API endpoints (`/press`, `/present`, `/api/twitch/eventsub`). The bot class in `bot.ts` has the right shape but `connectIRC()` is a stub that logs and returns. This plan wires the real tmi.js client, threads the active session ID through, and starts the bot in `server.ts`. Orchestrator integration (pressing/presenting as in-flow actions) is **out of scope** — it is blocked by issue #76.

**Tech Stack:** tmi.js 1.8.5 (already in `package.json`), node:test + node:assert/strict for tests, TypeScript ESM (`.js` extensions on all imports)

---

### Context: project conventions

```bash
npm test       # node --import tsx --test 'src/**/*.test.ts'
npm run lint   # tsc --noEmit — must pass after every task
```

- All `import` statements use `.js` extension even for `.ts` source files.
- Test files: `src/**/*.test.ts` — use `node:test` and `node:assert/strict`, never Jest/Vitest.
- `tmi.js` is imported as `import tmi from 'tmi.js'` (default export).

---

### What already exists — do NOT rewrite

| File | Status |
|------|--------|
| `src/twitch/commands.ts` | **Complete** — `parseCommand()` and `validateCommand()` fully implemented |
| `src/twitch/command-rate-limit.ts` | **Complete** — `CommandRateLimiter` works |
| `src/twitch/eventsub.ts` | **Complete** — signature validation, event parsing, `RedemptionRateLimiter` |
| `src/server.ts` `/api/court/sessions/:id/press` | **Complete** |
| `src/server.ts` `/api/court/sessions/:id/present` | **Complete** |
| `src/server.ts` `/api/twitch/eventsub` | **Complete** |

---

### Task 1: Wire `commands.ts` into `bot.ts`

The `parseCommand()` method in `TwitchBot` currently ignores the message and returns `null`. This task makes it delegate to `commands.ts`.

**Files:**
- Modify: `src/twitch/bot.ts:1-10` (imports) and `:122-138` (`parseCommand` method)
- Create: `src/twitch/bot.test.ts`

**Step 1: Write the failing test first**

Create `src/twitch/bot.test.ts`:

```ts
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
```

**Step 2: Run to confirm it fails**
```bash
npm test 2>&1 | grep -A5 "parseCommand"
```
Expected: fails with "should return a command" — because `parseCommand` returns `null`.

**Step 3: Add import to `bot.ts`**

Open `src/twitch/bot.ts`. After the existing imports, add:
```ts
import { parseCommand as parseChatCommand } from './commands.js';
```

**Step 4: Update `parseCommand` method in `TwitchBot`**

Find (around line 122):
```ts
    public parseCommand(
        message: string,
        username: string,
    ): ParsedCommand | null {
        // Check rate limit first
        const rateLimitCheck = this.commandRateLimiter.check(username, message);
        if (!rateLimitCheck.allowed) {
            console.warn(
                `[Twitch Bot] Command rate limited for ${username}: ${rateLimitCheck.reason}`,
            );
            return null;
        }

        // Will delegate to commands.ts parser
        // For now, stub
        console.log(`[Twitch Bot] Parsed command from ${username}: ${message}`);
        return null;
    }
```

Replace with:
```ts
    public parseCommand(
        message: string,
        username: string,
    ): ParsedCommand | null {
        const rateLimitCheck = this.commandRateLimiter.check(username, message);
        if (!rateLimitCheck.allowed) {
            console.warn(
                `[Twitch Bot] Rate limited ${username}: ${rateLimitCheck.reason}`,
            );
            return null;
        }

        const parsed = parseChatCommand(message, username);
        return parsed as ParsedCommand | null;
    }
```

Note: `CommandParseResult` from `commands.ts` and `ParsedCommand` from `bot.ts` have the same shape — the cast is safe. If TypeScript complains, align the types (both have `action`, `username`, `timestamp`, `params`).

**Step 5: Run tests**
```bash
npm test 2>&1 | grep -E "(pass|fail|parseCommand)"
```
Expected: all `parseCommand` tests pass.

**Step 6: Lint check**
```bash
npm run lint
```

**Step 7: Commit**
```bash
git add src/twitch/bot.ts src/twitch/bot.test.ts
git commit -m "feat(twitch): wire commands.ts into TwitchBot.parseCommand"
```

---

### Task 2: Implement `connectIRC()` using tmi.js

**Files:**
- Modify: `src/twitch/bot.ts`

The bot needs to know the active session ID to POST commands to the correct session endpoint. We'll add a `getActiveSessionId` callback to `BotConfig` and `connectIRC`.

**Step 1: Update `BotConfig` interface**

Find in `bot.ts`:
```ts
export interface BotConfig {
    channel: string;
    botToken: string;
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
}
```

Replace with:
```ts
export interface BotConfig {
    channel: string;
    botToken: string;
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
    /** Returns the current active session ID, or null if no session is running. */
    getActiveSessionId: () => Promise<string | null>;
}
```

**Step 2: Add tmi import**

At the top of `bot.ts`, add:
```ts
import tmi from 'tmi.js';
```

**Step 3: Add a private tmi client field**

Inside `TwitchBot` class, add after `private commandRateLimiter`:
```ts
    private tmiClient: tmi.Client | null = null;
```

**Step 4: Replace the `connectIRC()` stub**

Find:
```ts
    private async connectIRC(): Promise<void> {
        // Will be implemented with tmi.js
        // For now, stub
        console.log('[Twitch Bot] IRC connection stub');
    }
```

Replace with:
```ts
    private async connectIRC(): Promise<void> {
        if (!this.config) return;

        this.tmiClient = new tmi.Client({
            identity: {
                username: this.config.channel,
                password: this.config.botToken,
            },
            channels: [this.config.channel],
        });

        this.tmiClient.on(
            'message',
            async (_channel: string, tags: tmi.ChatUserstate, message: string) => {
                const username = tags.username ?? tags['display-name'] ?? 'unknown';
                const command = this.parseCommand(message, username);
                if (!command || !this.config) return;

                const sessionId = await this.config.getActiveSessionId();
                if (!sessionId) return;

                await this.forwardCommand(command, sessionId);
            },
        );

        await this.tmiClient.connect();
        console.log(`[Twitch Bot] IRC connected to #${this.config.channel}`);
    }
```

**Step 5: Add `forwardCommand` method**

Add this private method inside `TwitchBot`:
```ts
    private async forwardCommand(
        command: ParsedCommand,
        sessionId: string,
    ): Promise<void> {
        if (!this.config) return;

        let path: string;
        let body: Record<string, unknown>;

        if (command.action === 'press') {
            path = `/api/court/sessions/${sessionId}/press`;
            body = { statementNumber: command.params?.statementNumber };
        } else if (command.action === 'present') {
            path = `/api/court/sessions/${sessionId}/present`;
            body = {
                evidenceId: command.params?.evidenceId,
                statementNumber: command.params?.statementNumber,
            };
        } else if (command.action === 'vote') {
            path = `/api/court/sessions/${sessionId}/vote`;
            body = {
                voteType: 'verdict',
                choice: command.params?.choice,
                username: command.username,
            };
        } else if (command.action === 'sentence') {
            path = `/api/court/sessions/${sessionId}/vote`;
            body = {
                voteType: 'sentence',
                choice: command.params?.choice,
                username: command.username,
            };
        } else {
            return;
        }

        try {
            const url = `${this.config.apiBaseUrl}${path}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                console.warn(
                    `[Twitch Bot] API error ${res.status} for ${command.action} from ${command.username}`,
                );
            }
        } catch (err) {
            console.warn('[Twitch Bot] Failed to forward command:', err);
        }
    }
```

**Step 6: Update `stop()` to disconnect tmi client**

Find:
```ts
    public async stop(): Promise<void> {
        if (!this.isActive) {
            return;
        }

        console.log('[Twitch Bot] Stopping bot');
        this.isActive = false;
        // Cleanup: disconnect IRC, unregister EventSub
    }
```

Replace with:
```ts
    public async stop(): Promise<void> {
        if (!this.isActive) {
            return;
        }

        console.log('[Twitch Bot] Stopping bot');
        this.isActive = false;

        if (this.tmiClient) {
            await this.tmiClient.disconnect().catch(() => {});
            this.tmiClient = null;
        }
    }
```

**Step 7: Lint check**
```bash
npm run lint
```
Fix any TypeScript errors (likely: tmi.js types may need `@types/tmi.js` — check `npm ls @types/tmi.js`; if missing, the types are bundled with `tmi.js` itself at `node_modules/tmi.js/lib/index.d.ts`).

**Step 8: Run existing tests**
```bash
npm test
```
All existing tests should still pass. The new bot tests from Task 1 should still pass.

**Step 9: Commit**
```bash
git add src/twitch/bot.ts
git commit -m "feat(twitch): implement connectIRC with tmi.js, add forwardCommand"
```

---

### Task 3: Start the bot from `server.ts`

**Files:**
- Modify: `src/server.ts`

**Step 1: Read `createServerApp` in `server.ts`**

Find the `createServerApp` function. It creates the express app and store. After the server is listening, the bot should start.

**Step 2: Add the bot initialisation**

Find the import section at the top of `server.ts`. After existing twitch imports, ensure this is present (it may already be):
```ts
import { initTwitchBot } from './twitch/bot.js';
```

**Step 3: In `createServerApp`, initialise the bot after the store is created**

Find the section in `createServerApp` where the server is configured (after `registerApiRoutes`). Add bot startup:

```ts
    // Start Twitch bot (noop if credentials absent)
    const twitchBot = initTwitchBot({
        channel: process.env.TWITCH_CHANNEL ?? '',
        botToken: process.env.TWITCH_BOT_TOKEN ?? '',
        clientId: process.env.TWITCH_CLIENT_ID ?? '',
        clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
        apiBaseUrl: `http://localhost:${process.env.PORT ?? 3000}`,
        getActiveSessionId: async () => {
            const ids = await store.getRunningSessionIds();
            return ids[0] ?? null;
        },
    });

    twitchBot.start().catch(err => {
        console.warn('[Twitch Bot] Failed to start:', err);
    });
```

**Step 4: Lint check**
```bash
npm run lint
```

**Step 5: Smoke test**

Start the server without Twitch credentials:
```bash
npm run dev
```
Expected log output:
```
Twitch bot disabled: missing credentials. Set TWITCH_CHANNEL, TWITCH_BOT_TOKEN, TWITCH_CLIENT_ID.
```
Server should still start normally.

**Step 6: Run tests**
```bash
npm test
```

**Step 7: Commit**
```bash
git add src/server.ts
git commit -m "feat(twitch): initialise TwitchBot in server startup, noop when credentials absent"
```

---

### Task 4: Add tests for `forwardCommand` path selection

These tests verify that `forwardCommand` builds the correct URL and body for each action, without making real HTTP calls.

**Files:**
- Modify: `src/twitch/bot.test.ts`

**Step 1: Add fetch-mocking to the test file**

Add to `src/twitch/bot.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TwitchBot, type BotConfig } from './bot.js';

// ── forward command routing tests ──────────────────────────────────────────

describe('TwitchBot.forwardCommand routing', () => {
    const requests: Array<{ url: string; body: unknown }> = [];

    // Replace global fetch with a recorder
    const originalFetch = global.fetch;
    before(() => {
        global.fetch = async (url: string, init?: RequestInit) => {
            requests.push({ url, body: JSON.parse((init?.body as string) ?? '{}') });
            return { ok: true, status: 200 } as Response;
        };
    });
    after(() => {
        global.fetch = originalFetch;
    });

    function makeBotWithSession(sessionId: string): TwitchBot {
        const config: BotConfig = {
            channel: 'test',
            botToken: 'oauth:test',
            clientId: 'cid',
            clientSecret: 'csec',
            apiBaseUrl: 'http://localhost:3000',
            getActiveSessionId: async () => sessionId,
        };
        // Bypass the credential guard: set config directly
        const bot = new TwitchBot(config);
        return bot;
    }

    it('!press routes to /press with statementNumber', async () => {
        const bot = makeBotWithSession('session-abc');
        // parseCommand → forwardCommand via public method path
        const cmd = bot.parseCommand('!press 3', 'viewer1');
        assert.ok(cmd);
        // Call forwardCommand via the public path (we expose it for testing)
        await (bot as any).forwardCommand(cmd, 'session-abc');
        const req = requests.at(-1)!;
        assert.ok(req.url.includes('/api/court/sessions/session-abc/press'));
        assert.equal((req.body as any).statementNumber, 3);
    });

    it('!present routes to /present with evidenceId', async () => {
        const bot = makeBotWithSession('session-abc');
        const cmd = bot.parseCommand('!present banana 2', 'viewer2');
        assert.ok(cmd);
        await (bot as any).forwardCommand(cmd, 'session-abc');
        const req = requests.at(-1)!;
        assert.ok(req.url.includes('/api/court/sessions/session-abc/present'));
        assert.equal((req.body as any).evidenceId, 'banana');
    });

    it('!vote routes to /vote with voteType verdict', async () => {
        const bot = makeBotWithSession('session-abc');
        const cmd = bot.parseCommand('!vote guilty', 'viewer3');
        assert.ok(cmd);
        await (bot as any).forwardCommand(cmd, 'session-abc');
        const req = requests.at(-1)!;
        assert.ok(req.url.includes('/api/court/sessions/session-abc/vote'));
        assert.equal((req.body as any).voteType, 'verdict');
        assert.equal((req.body as any).choice, 'guilty');
    });
});
```

Note: `TwitchBot` constructor currently checks `hasRequiredEnvVars()` which reads `process.env.*`. For the test to bypass that, either:
- Set env vars in the test: `process.env.TWITCH_CHANNEL = 'test'; ...`
- Or refactor `hasRequiredEnvVars` to check the config object instead of process.env.

The simpler fix: add env vars at test start:
```ts
before(() => {
    process.env.TWITCH_CHANNEL = 'test';
    process.env.TWITCH_BOT_TOKEN = 'oauth:test';
    process.env.TWITCH_CLIENT_ID = 'cid';
    process.env.TWITCH_CLIENT_SECRET = 'csec';
    // ... fetch mock ...
});
after(() => {
    delete process.env.TWITCH_CHANNEL;
    delete process.env.TWITCH_BOT_TOKEN;
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    // ... restore fetch ...
});
```

**Step 2: Run all tests**
```bash
npm test
```
Expected: all previous tests pass + new routing tests pass.

**Step 3: Lint**
```bash
npm run lint
```

**Step 4: Commit**
```bash
git add src/twitch/bot.test.ts
git commit -m "test(twitch): add forwardCommand routing tests"
```

---

### Out of scope — blocked by #76

The following acceptance criteria from issue #77 require the **press/present statements loop** (issue #76) which doesn't exist yet:

- Orchestrator checks `pressVotes` / `presentVotes` at each round's decision point
- Channel point "Hold It!" adds an extra witness statement
- Channel point "Order in the Court!" triggers judge intervention in the flow

These are future work. The API endpoints accumulate votes correctly — the orchestrator reading is the missing piece.

---

### Integration test (manual, requires Twitch credentials)

When `TWITCH_CHANNEL`, `TWITCH_BOT_TOKEN`, `TWITCH_CLIENT_ID`, and `TWITCH_CLIENT_SECRET` are set:

1. Start a session, note the session ID from server logs
2. In Twitch chat: type `!press 2`
3. Check server logs for: `[Twitch Bot] ...` and `POST /api/court/sessions/:id/press`
4. Check session metadata in `/api/court/sessions/:id` — `pressVotes` should show `{"2": 1}`

For EventSub redemptions (channel points):
1. Register the webhook subscription with Twitch CLI: `twitch event trigger channel-points-redemption -s $TWITCH_CLIENT_SECRET -u http://your-server/api/twitch/eventsub?sessionId=SESSION_ID`
2. Redemption titled "Objection!" should emit a `render_directive` SSE event
