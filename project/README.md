# YouTube Creator Email Agent

A full-stack Next.js application that searches YouTube creators, filters channels by subscriber count, and finds likely business emails using a Gemini-guided agent.

## Stack

- Next.js App Router
- Tailwind CSS
- Axios
- Playwright
- dotenv
- Gemini API
- YouTube Data API v3

## Features

- Single-page dashboard for running the agent
- Clean lead cards for client-friendly demos
- `POST /run-agent` backend endpoint
- Gemini-guided decision loop
- YouTube search and channel filtering
- Email extraction from descriptions, social links, and websites

## Project Structure

```text
project
├── app
│   ├── globals.css
│   ├── layout.js
│   ├── page.js
│   └── run-agent
│       └── route.js
├── components
│   └── lead-agent-dashboard.jsx
├── tools
│   ├── agent.js
│   ├── email.js
│   ├── scraper.js
│   └── youtube.js
├── .env
├── .env.example
├── agent.js
├── next.config.mjs
├── package.json
├── postcss.config.mjs
└── README.md
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install Playwright Chromium:

```bash
npx playwright install chromium
```

3. Add your keys to `.env`:

```env
YOUTUBE_API_KEY=your_youtube_key_here
GEMINI_API_KEY=your_gemini_key_here
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=3600000
MAX_VIDEOS_PER_RUN=10
MAX_CHANNELS_PER_RUN=10
MAX_LINKS_PER_CHANNEL=5
```

## Run The App

Start the local web app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If you want the frontend to call a separate backend service, set:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:10000
```

## Backend API

Endpoint:

```text
POST /run-agent
```

Example request body:

```json
{
  "query": "AI tools",
  "minSubs": 10000,
  "maxSubs": 200000,
  "maxVideos": 10
}
```

The backend clamps each run to your configured workload limits and tracks how
many searches a user has left in the current rate-limit window.

Example success response:

```json
{
  "results": [
    {
      "channel": "Example Creator",
      "subscribers": 50000,
      "email": "contact@example.com",
      "source": "description",
      "confidence": 0.9
    }
  ],
  "rateLimit": {
    "limit": 10,
    "remaining": 9,
    "resetAt": "2026-04-02T12:30:00.000Z",
    "retryAfterSeconds": 3600
  },
  "limits": {
    "maxVideosPerRun": 10,
    "maxChannelsPerRun": 10,
    "maxLinksPerChannel": 5
  }
}
```

## CLI Option

You can still run the original CLI flow:

```bash
npm run agent:cli
```

## Split Deployment

Recommended production split:

- `project/` to Vercel for the frontend
- `backend/` to Render for the scraping API

On Vercel:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

On Render:

```env
YOUTUBE_API_KEY=
GEMINI_API_KEY=
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=3600000
MAX_VIDEOS_PER_RUN=10
MAX_CHANNELS_PER_RUN=10
MAX_LINKS_PER_CHANNEL=5
FRONTEND_ORIGIN=https://your-vercel-site.vercel.app
PORT=10000
```

## Notes

- The agent checks description content first, then social links, then websites.
- The API returns JSON and does not require authentication.
- The app does not use a database.
- Rate limiting is implemented as an in-memory per-IP limiter with a default cap of 10 searches per window.
- Because there is no database or Redis store, counters can reset on server restarts and may vary across multiple serverless instances.
- If your YouTube key is restricted incorrectly, the backend will return a clear configuration error.
