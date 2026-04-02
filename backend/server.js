import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  consumeRateLimit,
  formatRateLimitReset,
  getClientIdentifier,
  getRateLimitState,
  getRuntimeLimits,
} from "./lib/request-limits.js";
import { runAgent } from "./tools/agent.js";

const app = express();
const port = Number(process.env.PORT || 10000);

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrigin(origin) {
  return origin?.trim().replace(/\/$/, "");
}

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);

      if (!normalizedOrigin || allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${normalizedOrigin} is not allowed by CORS.`));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

function applyRateLimitHeaders(response, rateLimit) {
  response.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  response.set("X-RateLimit-Reset", formatRateLimitReset(rateLimit.resetAt));

  if (rateLimit.retryAfterSeconds > 0) {
    response.set("Retry-After", String(rateLimit.retryAfterSeconds));
  }
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "creator-lead-agent-backend",
  });
});

app.post("/run-agent", async (request, response) => {
  const identifier = getClientIdentifier(request);
  const limits = getRuntimeLimits();

  try {
    const body = request.body ?? {};
    const query = String(body.query ?? "").trim();

    if (!query) {
      const rateLimit = getRateLimitState(identifier);
      applyRateLimitHeaders(response, rateLimit);
      return response.status(400).json({ error: "Query is required." });
    }

    const minSubs = Math.max(0, toNumber(body.minSubs, 0));
    const maxSubs = Math.max(minSubs, toNumber(body.maxSubs, 200000));
    const maxVideos = Math.min(
      limits.maxVideosPerRun,
      Math.max(1, toNumber(body.maxVideos, limits.maxVideosPerRun)),
    );
    const rateLimit = consumeRateLimit(identifier);

    if (!rateLimit.allowed) {
      applyRateLimitHeaders(response, rateLimit);
      return response.status(429).json({
        error: `Rate limit reached. You can run up to ${rateLimit.limit} searches per window.`,
        rateLimit: {
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetAt: formatRateLimitReset(rateLimit.resetAt),
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      });
    }

    const payload = await runAgent(query, {
      minSubs,
      maxSubs,
      maxVideos,
      maxChannelsPerRun: limits.maxChannelsPerRun,
      maxLinksPerChannel: limits.maxLinksPerChannel,
    });

    applyRateLimitHeaders(response, rateLimit);
    return response.json({
      ...payload,
      rateLimit: {
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: formatRateLimitReset(rateLimit.resetAt),
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      limits: {
        maxVideosPerRun: limits.maxVideosPerRun,
        maxChannelsPerRun: limits.maxChannelsPerRun,
        maxLinksPerChannel: limits.maxLinksPerChannel,
      },
    });
  } catch (error) {
    const rateLimit = getRateLimitState(identifier);
    applyRateLimitHeaders(response, rateLimit);
    return response.status(500).json({
      error: error.message || "Something went wrong while running the agent.",
    });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});
