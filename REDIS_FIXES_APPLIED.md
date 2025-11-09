# 🔧 Redis Connection Fixes Applied

## Problem Identified

Redis was showing as "not being used" because:

1. **BullMQ Redis connection (`redisConnection`) was never verified**
   - Created but never explicitly connected
   - No error handling or logging
   - BullMQ would try to connect on first use, but failures were silent

2. **Two separate Redis connections**
   - `redisConnection` from `lib/redis.ts` - used by BullMQ queues
   - Separate connection in `start()` - used for rate limiting only
   - No coordination between them

3. **No connection verification**
   - No health checks
   - No startup verification
   - No way to know if Redis is actually working

---

## ✅ Fixes Applied

### 1. Enhanced Redis Connection (`apps/api/src/lib/redis.ts`)

**Added:**
- ✅ Connection event handlers (connect, ready, error, close)
- ✅ Proper retry strategy
- ✅ Connection timeout configuration
- ✅ `verifyRedisConnection()` function to test connection with PING

**Changes:**
```typescript
// Before: No connection verification
export const redisConnection: IORedis = (() => {
  singleton = new IORedis(url, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
  });
  return singleton;
})();

// After: Proper connection handling
export const redisConnection: IORedis = (() => {
  singleton = new IORedis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    connectTimeout: 5000,
  });
  
  // Event handlers for monitoring
  singleton.on('error', ...);
  singleton.on('connect', ...);
  singleton.on('ready', ...);
  singleton.on('close', ...);
  
  return singleton;
})();

// New: Verification function
export async function verifyRedisConnection(): Promise<boolean> {
  // Connects and tests with PING
  // Returns true if Redis is working
}
```

### 2. Startup Verification (`apps/api/src/index.ts`)

**Added:**
- ✅ Redis connection verification during startup
- ✅ Clear logging of Redis status
- ✅ Warnings if Redis is not available

**Changes:**
```typescript
// Before: No verification
// BullMQ queues created without checking Redis

// After: Verify before using
const bullMQRedisOk = await verifyRedisConnection();
if (bullMQRedisOk) {
  app.log.info('✅ BullMQ Redis connection verified (queues will work)');
} else {
  app.log.warn('⚠️  BullMQ Redis connection failed (queues may not work)');
}
```

### 3. Enhanced Health Endpoint (`/health`)

**Added:**
- ✅ Redis status in health check response
- ✅ Shows if Redis is configured, connected, and queues are working

**Response:**
```json
{
  "ok": true,
  "uptime": 12345,
  "redis": {
    "configured": true,
    "connected": true,
    "queues": true
  }
}
```

---

## 🔍 How to Verify Redis is Working

### 1. Check Startup Logs

After deploying, look for:
```
✅ BullMQ Redis connection verified (queues will work)
[Redis Connection] ✅ Redis connection verified
[Redis Connection] Connected to Redis
[Redis Connection] Redis ready for commands
```

If Redis fails:
```
⚠️  BullMQ Redis connection failed (queues may not work)
[Redis Connection] ❌ Redis connection failed: ...
```

### 2. Check Health Endpoint

```bash
curl -H "X-API-Key: YOUR_KEY" https://sinna.site/health | jq .redis
```

Expected:
```json
{
  "configured": true,
  "connected": true,
  "queues": true
}
```

### 3. Check Upstash Dashboard

- Go to: https://console.upstash.com/
- Check your Redis instance
- Look for:
  - **Commands/sec** > 0 (shows activity)
  - **Connections** > 0 (shows active connections)
  - **Memory usage** (should be increasing as queues are used)

---

## 🚨 Troubleshooting

### Redis shows "not being used" in Upstash

**Possible causes:**
1. **Connection not established** - Check startup logs for connection errors
2. **No queue activity** - Queues only use Redis when jobs are created
3. **Wrong Redis URL** - Verify `REDIS_URL` in Render environment variables

**Fix:**
1. Check Render logs for Redis connection status
2. Create a test job to trigger queue activity
3. Verify `REDIS_URL` format: `rediss://default:TOKEN@HOST:6379`

### Redis connection fails

**Check:**
1. `REDIS_URL` is set in Render environment variables
2. Redis URL format is correct (starts with `rediss://` for TLS)
3. Upstash Redis instance is active
4. Network connectivity (Render → Upstash)

**Fix:**
1. Verify `REDIS_URL` in Render Dashboard
2. Test connection manually:
   ```bash
   # In Render Shell
   node -e "const IORedis = require('ioredis'); const r = new IORedis(process.env.REDIS_URL); r.ping().then(console.log).catch(console.error);"
   ```

### Queues not processing

**Check:**
1. Worker service is running
2. Worker connects to Redis (check worker logs)
3. Queues exist in Redis (check Upstash dashboard)

**Fix:**
1. Verify worker service is active
2. Check worker logs for "Worker Redis connected"
3. Create a test job and verify it appears in queues

---

## 📋 Next Steps

1. **Deploy the fixes** (code changes are ready)
2. **Check startup logs** for Redis connection status
3. **Test health endpoint** to verify Redis status
4. **Create a test job** to trigger queue activity
5. **Monitor Upstash dashboard** for Redis usage

---

## ✅ Success Criteria

After fixes, you should see:

1. **Startup logs:**
   ```
   ✅ BullMQ Redis connection verified (queues will work)
   [Redis Connection] ✅ Redis connection verified
   ```

2. **Health endpoint:**
   ```json
   {
     "redis": {
       "configured": true,
       "connected": true,
       "queues": true
     }
   }
   ```

3. **Upstash dashboard:**
   - Commands/sec > 0
   - Connections > 0
   - Memory usage increasing

---

**Redis should now be properly connected and monitored!** 🎉

