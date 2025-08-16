
import Redis from 'ioredis';

let redis: Redis;

const getRedisInstance = (): Redis => {
  if (!redis) {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL environment variable not set');
      }
      console.log('Connecting to Redis...');
      redis = new Redis(redisUrl);

      redis.on('connect', () => {
        console.log('Successfully connected to Redis.');
      });

      redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });

    } catch (error) {
      console.error('Failed to create Redis instance:', error);
      throw error; // Re-throw the error to be handled by the caller
    }
  }
  return redis;
};

export const getClient = (): Redis => {
  return getRedisInstance();
};

// --- Basic CRUD Helpers ---

export const setJson = async (key: string, value: object, pipeline?: Redis): Promise<void> => {
  const client = pipeline || getClient();
  await client.set(key, JSON.stringify(value));
};

export const getJson = async <T>(key: string): Promise<T | null> => {
  const client = getClient();
  const data = await client.get(key);
  if (data) {
    return JSON.parse(data) as T;
  }
  return null;
};

export const del = async (key: string, pipeline?: Redis): Promise<void> => {
  const client = pipeline || getClient();
  await client.del(key);
};

export default getClient;
