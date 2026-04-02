const DEFAULT_RATE_LIMIT = 10;
const DEFAULT_RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_VIDEOS = 10;
const HARD_MAX_VIDEOS = 25;
const DEFAULT_MAX_CHANNELS = 10;
const HARD_MAX_CHANNELS = 25;
const DEFAULT_MAX_LINKS_PER_CHANNEL = 5;
const HARD_MAX_LINKS_PER_CHANNEL = 15;

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStore() {
  if (!globalThis.__agentRateLimitStore) {
    globalThis.__agentRateLimitStore = new Map();
  }

  return globalThis.__agentRateLimitStore;
}

export function getRuntimeLimits() {
  return {
    rateLimitMaxRequests: toPositiveInteger(
      process.env.RATE_LIMIT_MAX_REQUESTS,
      DEFAULT_RATE_LIMIT,
    ),
    rateLimitWindowMs: toPositiveInteger(
      process.env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_WINDOW_MS,
    ),
    maxVideosPerRun: clamp(
      toPositiveInteger(process.env.MAX_VIDEOS_PER_RUN, DEFAULT_MAX_VIDEOS),
      1,
      HARD_MAX_VIDEOS,
    ),
    maxChannelsPerRun: clamp(
      toPositiveInteger(process.env.MAX_CHANNELS_PER_RUN, DEFAULT_MAX_CHANNELS),
      1,
      HARD_MAX_CHANNELS,
    ),
    maxLinksPerChannel: clamp(
      toPositiveInteger(
        process.env.MAX_LINKS_PER_CHANNEL,
        DEFAULT_MAX_LINKS_PER_CHANNEL,
      ),
      1,
      HARD_MAX_LINKS_PER_CHANNEL,
    ),
  };
}

export function getClientIdentifier(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.ip || request.socket?.remoteAddress || "local-dev-user";
}

function getRateLimitEntry(identifier, now, windowMs) {
  const store = getStore();
  const current = store.get(identifier);

  if (!current || current.resetAt <= now) {
    const freshEntry = {
      count: 0,
      resetAt: now + windowMs,
    };

    store.set(identifier, freshEntry);
    return freshEntry;
  }

  return current;
}

export function getRateLimitState(identifier, options = {}) {
  const now = Date.now();
  const limits = getRuntimeLimits();
  const maxRequests = options.maxRequests ?? limits.rateLimitMaxRequests;
  const windowMs = options.windowMs ?? limits.rateLimitWindowMs;
  const entry = getRateLimitEntry(identifier, now, windowMs);

  return {
    identifier,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function consumeRateLimit(identifier, options = {}) {
  const now = Date.now();
  const limits = getRuntimeLimits();
  const maxRequests = options.maxRequests ?? limits.rateLimitMaxRequests;
  const windowMs = options.windowMs ?? limits.rateLimitWindowMs;
  const entry = getRateLimitEntry(identifier, now, windowMs);

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;

  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function formatRateLimitReset(resetAt) {
  return new Date(resetAt).toISOString();
}
