-- Token Bucket Rate Limiting
-- Redis Lua script for atomic rate limiting checks
--
-- KEYS[1] = bucket key (e.g., "bucket:device:ABC")
-- ARGV[1] = capacity (max tokens)
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = current timestamp (milliseconds)
--
-- Returns:
--   1 if allowed (token consumed)
--   0 if rate limited (no tokens available)

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or tonumber(ARGV[1])  -- Start with full capacity
local last = tonumber(bucket[2]) or tonumber(ARGV[3])

-- Calculate tokens to add based on time elapsed
local now = tonumber(ARGV[3])
local elapsed = (now - last) / 1000.0  -- Convert ms to seconds
local refillRate = tonumber(ARGV[2])
local tokensToAdd = elapsed * refillRate

-- Add tokens (capped at capacity)
local capacity = tonumber(ARGV[1])
tokens = math.min(capacity, tokens + tokensToAdd)

-- Check if we have at least 1 token
if tokens < 1 then
  -- No tokens available, rate limited
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', KEYS[1], 3600)  -- Expire after 1 hour of inactivity
  return 0
end

-- Consume 1 token
tokens = tokens - 1

-- Update bucket state
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', KEYS[1], 3600)

return 1
