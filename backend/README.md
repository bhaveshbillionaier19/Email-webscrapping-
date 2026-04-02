# Backend

Standalone Render-ready backend for the creator lead agent.

## Local Run

```bash
cd backend
npm install
npx playwright install chromium
npm run dev
```

The API will run on:

```text
http://localhost:10000
```

## Required Environment Variables

```env
YOUTUBE_API_KEY=
GEMINI_API_KEY=
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=3600000
MAX_VIDEOS_PER_RUN=10
MAX_CHANNELS_PER_RUN=10
MAX_LINKS_PER_CHANNEL=5
FRONTEND_ORIGIN=http://localhost:3000
PORT=10000
```

## Routes

- `GET /health`
- `POST /run-agent`
