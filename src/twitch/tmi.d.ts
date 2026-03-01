// tmi.js v1.8.5 ships no TypeScript declarations and @types/tmi.js is not available.
// This minimal declaration provides the types needed by bot.ts.
declare module 'tmi.js' {
    interface ChatUserstate {
        username?: string;
        'display-name'?: string;
        [key: string]: string | boolean | undefined;
    }

    interface Options {
        identity?: {
            username: string;
            password: string;
        };
        channels?: string[];
        options?: Record<string, unknown>;
    }

    class Client {
        constructor(opts: Options);
        on(event: 'message', listener: (channel: string, tags: ChatUserstate, message: string, self: boolean) => void): this;
        on(event: string, listener: (...args: unknown[]) => void): this;
        connect(): Promise<[string, number]>;
        disconnect(): Promise<[string, number]>;
        removeAllListeners(event?: string): this;
    }

    const tmi: {
        Client: typeof Client;
    };

    export { Client, ChatUserstate, Options };
    export default tmi;
}
