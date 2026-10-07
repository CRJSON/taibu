import type Redis from 'ioredis';
import type { RateLimitConfig, RateLimitResult } from '@/lib/rate-limit';

// One atomic admission: Redis time defines the window, and denials do not mutate it.
export const REDIS_RATE_LIMIT_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local maximum = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local state = redis.call('HMGET', KEYS[1], 'count', 'reset')
local count = tonumber(state[1])
local reset = tonumber(state[2])
if not count or not reset or now >= reset then
  reset = now + window
  redis.call('HSET', KEYS[1], 'count', 1, 'reset', reset)
  redis.call('PEXPIRE', KEYS[1], window)
  return {1, maximum - 1, reset}
end
if count >= maximum then
  return {0, 0, reset}
end
count = redis.call('HINCRBY', KEYS[1], 'count', 1)
return {1, maximum - count, reset}
`;

export const REDIS_RATE_LIMIT_OPTIONS = {
    lazyConnect: true,
    connectTimeout: 1_000,
    commandTimeout: 1_000,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    autoResendUnfulfilledCommands: false,
} as const;

type Client = Pick<Redis, 'connect' | 'disconnect' | 'eval' | 'on'>;
type ClientFactory = (url: string) => Promise<Client>;

export function redisRateLimitKey(identifier: string, endpoint: string): string {
    return `taibu:rate-limit:v1:${Buffer.from(JSON.stringify([identifier, endpoint])).toString('base64url')}`;
}

function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Rate limiter timeout')), timeoutMs);
        operation.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}

// Factory injection keeps transport tests offline; only this adapter owns Redis lifecycle.
export function createRedisRateLimiter(factory: ClientFactory = async (url) => {
    const { default: RedisClient } = await import('ioredis');
    return new RedisClient(url, REDIS_RATE_LIMIT_OPTIONS);
}) {
    let connection: { url: string; client: Client; ready: Promise<void> } | undefined;
    let creating: Promise<Client> | undefined;
    return async (identifier: string, endpoint: string, config: RateLimitConfig): Promise<RateLimitResult> => {
        const url = process.env.REDIS_URL;
        if (!url) throw new Error('Missing Redis configuration');
        const parsed = new URL(url);
        if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname
            || parsed.search || parsed.hash || !/^\/(?:\d+)?$/.test(parsed.pathname || '/')) {
            throw new Error('Invalid Redis configuration');
        }
        if (connection && connection.url !== url) {
            connection.client.disconnect();
            connection = undefined;
            creating = undefined;
        }
        // Concurrent first requests share a single connection handshake.
        creating ??= factory(url).catch(() => {
            creating = undefined;
            throw new Error('Redis client initialization failed');
        });
        const client = await creating;
        if (!connection) {
            // Never pass transport errors/URLs to the logger (credentials may be embedded).
            client.on('error', () => {});
            connection = { url, client, ready: bounded(client.connect(), 1_000) };
        }
        const current = connection;
        try {
            await current.ready;
            const result = await bounded(client.eval(REDIS_RATE_LIMIT_SCRIPT, 1,
                redisRateLimitKey(identifier, endpoint), config.maxRequests, config.windowMs), 1_000);
            if (!Array.isArray(result) || result.length !== 3
                || (result[0] !== 0 && result[0] !== 1)
                || !Number.isInteger(result[1]) || result[1] < 0 || result[1] > config.maxRequests
                || !Number.isSafeInteger(result[2]) || result[2] < 0 || result[2] > 8.64e15) {
                throw new Error('Invalid Redis rate limit response');
            }
            return { allowed: result[0] === 1, remaining: result[1], resetAt: new Date(result[2]) };
        } catch (error) {
            // A timeout may have executed on Redis. Never replay or use another counter.
            client.disconnect();
            if (connection === current) {
                connection = undefined;
                creating = undefined;
            }
            throw error;
        }
    };
}

export const consumeRedisRateLimit = createRedisRateLimiter();
