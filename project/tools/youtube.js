import axios from "axios";
import { extractLinks } from "./email.js";
import { loadState, saveState } from "./stateManager.js";

const youtubeApi = axios.create({
  baseURL: "https://www.googleapis.com/youtube/v3",
  timeout: 30000,
});

function ensureYoutubeKey() {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("Missing YOUTUBE_API_KEY in .env");
  }

  return process.env.YOUTUBE_API_KEY;
}

function formatYoutubeError(error) {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message || error.message;
  const reason = error.response?.data?.error?.details?.[0]?.reason;

  if (status === 403 && reason === "API_KEY_SERVICE_BLOCKED") {
    return new Error(
      "YouTube API key is blocked for YouTube Data API v3. In Google Cloud Console, open APIs & Services > Credentials > your API key, then allow YouTube Data API v3 under API restrictions or remove the blocking restriction.",
    );
  }

  return new Error(`YouTube API request failed (${status ?? "unknown"}): ${message}`);
}

function unique(values) {
  return [...new Set(values)];
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export function filterNewVideos(videos = [], seenVideos = []) {
  const seenVideoSet = new Set(seenVideos);
  return videos.filter((video) => video.videoId && !seenVideoSet.has(video.videoId));
}

export async function searchVideos(query, maxResults = 10) {
  const apiKey = ensureYoutubeKey();
  const state = await loadState();
  const queryState = state[query] ?? {
    nextPageToken: null,
    seenVideos: [],
  };

  if (queryState.nextPageToken === null && queryState.seenVideos.length > 0) {
    console.log("No more new videos available");
    return {
      videos: [],
      pagination: {
        query,
        usedPageToken: null,
        nextPageToken: null,
        seenVideosCount: queryState.seenVideos.length,
        noMoreVideosAvailable: true,
      },
    };
  }

  let searchResponse;

  try {
    searchResponse = await youtubeApi.get("/search", {
      params: {
        key: apiKey,
        q: query,
        type: "video",
        part: "snippet",
        maxResults,
        ...(queryState.nextPageToken ? { pageToken: queryState.nextPageToken } : {}),
      },
    });
  } catch (error) {
    throw formatYoutubeError(error);
  }

  const searchItems = searchResponse.data.items ?? [];
  const responseNextPageToken = searchResponse.data.nextPageToken ?? null;
  const videoIds = searchItems
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  state[query] = {
    nextPageToken: responseNextPageToken,
    seenVideos: unique([...queryState.seenVideos, ...videoIds]),
  };
  await saveState(state);

  if (videoIds.length === 0) {
    if (!responseNextPageToken) {
      console.log("No more new videos available");
    }

    return {
      videos: [],
      pagination: {
        query,
        usedPageToken: queryState.nextPageToken,
        nextPageToken: responseNextPageToken,
        seenVideosCount: state[query].seenVideos.length,
        noMoreVideosAvailable: !responseNextPageToken,
      },
    };
  }

  let detailsResponse;

  try {
    detailsResponse = await youtubeApi.get("/videos", {
      params: {
        key: apiKey,
        part: "snippet",
        id: videoIds.join(","),
      },
    });
  } catch (error) {
    throw formatYoutubeError(error);
  }

  const detailsMap = new Map(
    (detailsResponse.data.items ?? []).map((item) => [item.id, item]),
  );

  const mappedVideos = searchItems.map((item) => {
    const videoId = item.id?.videoId;
    const detail = detailsMap.get(videoId);
    const snippet = detail?.snippet ?? item.snippet ?? {};

    return {
      videoId,
      title: snippet.title ?? "",
      description: snippet.description ?? "",
      channelId: snippet.channelId ?? item.snippet?.channelId ?? "",
      channelTitle: snippet.channelTitle ?? item.snippet?.channelTitle ?? "",
      videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    };
  });

  const newVideos = filterNewVideos(mappedVideos, queryState.seenVideos);

  if (newVideos.length === 0 && !responseNextPageToken) {
    console.log("No more new videos available");
  }

  return {
    videos: newVideos,
    pagination: {
      query,
      usedPageToken: queryState.nextPageToken,
      nextPageToken: responseNextPageToken,
      seenVideosCount: state[query].seenVideos.length,
      noMoreVideosAvailable: newVideos.length === 0 && !responseNextPageToken,
    },
  };
}

export async function getChannelStats(channelIds = []) {
  const apiKey = ensureYoutubeKey();
  const uniqueChannelIds = unique(channelIds).filter(Boolean);
  const batches = chunk(uniqueChannelIds, 50);
  const channels = [];

  for (const batch of batches) {
    let response;

    try {
      response = await youtubeApi.get("/channels", {
        params: {
          key: apiKey,
          part: "snippet,statistics",
          id: batch.join(","),
        },
      });
    } catch (error) {
      throw formatYoutubeError(error);
    }

    for (const item of response.data.items ?? []) {
      const description = item.snippet?.description ?? "";
      const subscriberCount = Number(item.statistics?.subscriberCount ?? 0);

      channels.push({
        channelId: item.id,
        channel: item.snippet?.title ?? "",
        description,
        subscribers: subscriberCount,
        subscriberCountHidden: Boolean(item.statistics?.hiddenSubscriberCount),
        channelUrl: `https://www.youtube.com/channel/${item.id}`,
        links: extractLinks(description),
      });
    }
  }

  return channels;
}

export function filterChannels(channels = [], minSubs = 0, maxSubs = Number.MAX_SAFE_INTEGER) {
  return channels.filter((channel) => {
    if (channel.subscriberCountHidden) {
      return false;
    }

    return channel.subscribers >= minSubs && channel.subscribers <= maxSubs;
  });
}
