import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  formatRateLimitReset,
  getClientIdentifier,
  getRateLimitState,
  getRuntimeLimits,
} from "../../lib/request-limits.js";
import { runAgent } from "../../tools/agent.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyRateLimitHeaders(response, rateLimit) {
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  response.headers.set("X-RateLimit-Reset", formatRateLimitReset(rateLimit.resetAt));

  if (rateLimit.retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
  }

  return response;
}

export async function POST(request) {
  const identifier = getClientIdentifier(request);
  const limits = getRuntimeLimits();

  try {
    const body = await request.json();
    const query = String(body.query ?? "").trim();

    if (!query) {
      return applyRateLimitHeaders(
        NextResponse.json(
          { error: "Query is required." },
          { status: 400 },
        ),
        getRateLimitState(identifier),
      );
    }

    const minSubs = Math.max(0, toNumber(body.minSubs, 0));
    const maxSubs = Math.max(minSubs, toNumber(body.maxSubs, 200000));
    const maxVideos = Math.min(
      limits.maxVideosPerRun,
      Math.max(1, toNumber(body.maxVideos, limits.maxVideosPerRun)),
    );
    const rateLimit = consumeRateLimit(identifier);

    if (!rateLimit.allowed) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: `Rate limit reached. You can run up to ${rateLimit.limit} searches per window.`,
            rateLimit: {
              limit: rateLimit.limit,
              remaining: rateLimit.remaining,
              resetAt: formatRateLimitReset(rateLimit.resetAt),
              retryAfterSeconds: rateLimit.retryAfterSeconds,
            },
          },
          { status: 429 },
        ),
        rateLimit,
      );
    }

    const payload = await runAgent(query, {
      minSubs,
      maxSubs,
      maxVideos,
      maxChannelsPerRun: limits.maxChannelsPerRun,
      maxLinksPerChannel: limits.maxLinksPerChannel,
    });

    return applyRateLimitHeaders(
      NextResponse.json({
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
      }),
      rateLimit,
    );
  } catch (error) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: error.message || "Something went wrong while running the agent.",
        },
        { status: 500 },
      ),
      getRateLimitState(identifier),
    );
  }
}
