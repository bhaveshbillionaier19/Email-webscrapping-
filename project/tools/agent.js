import "dotenv/config";
import axios from "axios";
import {
  extractEmails,
  extractLinks,
  isBusinessEmail,
  pickBestEmail,
  sourceFromUrl,
  splitLinks,
} from "./email.js";
import { scrapePage } from "./scraper.js";
import { filterChannels, getChannelStats, searchVideos } from "./youtube.js";

const GEMINI_PROMPT = `You are an AI lead generation agent.

Your job is to find business emails of creators.

Always prioritize:

description
social links
websites

Return only the next best action.`;

function ensureGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in .env");
  }

  return process.env.GEMINI_API_KEY;
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

function unique(values) {
  return [...new Set(values)];
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackNextStep(context) {
  if (context.foundEmail) {
    return {
      action: "stop",
      reason: "A valid business email was already found.",
    };
  }

  if (!context.state.descriptionChecked) {
    return {
      action: "description",
      reason: "Descriptions should be checked first.",
    };
  }

  if (!context.state.socialLinksChecked && context.socialLinks.length > 0) {
    return {
      action: "social_links",
      reason: "Social links are the next best source.",
    };
  }

  if (!context.state.websiteLinksChecked && context.websiteLinks.length > 0) {
    return {
      action: "website_links",
      reason: "Website links are the next remaining source.",
    };
  }

  return {
    action: "stop",
    reason: "No more useful sources are available.",
  };
}

function summarizeContext(context) {
  return {
    channel: context.channel,
    subscribers: context.subscribers,
    foundEmail: context.foundEmail,
    state: context.state,
    descriptionEmailCandidates: context.descriptionEmailCandidates,
    socialLinks: context.socialLinks.slice(0, 10),
    websiteLinks: context.websiteLinks.slice(0, 10),
    previousActions: context.previousActions,
  };
}

function isAllowedAction(action, context, fallback) {
  if (action === "description") {
    return !context.state.descriptionChecked;
  }

  if (action === "social_links") {
    return (
      context.state.descriptionChecked &&
      !context.state.socialLinksChecked &&
      context.socialLinks.length > 0
    );
  }

  if (action === "website_links") {
    return (
      context.state.descriptionChecked &&
      (context.state.socialLinksChecked || context.socialLinks.length === 0) &&
      !context.state.websiteLinksChecked &&
      context.websiteLinks.length > 0
    );
  }

  if (action === "stop") {
    return context.foundEmail || fallback.action === "stop";
  }

  return false;
}

export async function decideNextStep(context) {
  const apiKey = ensureGeminiKey();
  const fallback = fallbackNextStep(context);

  const prompt = `${GEMINI_PROMPT}

Pick exactly one action from this list:
- description
- social_links
- website_links
- stop

Reply as strict JSON with this shape:
{"action":"description|social_links|website_links|stop","reason":"short reason"}

Context:
${JSON.stringify(summarizeContext(context), null, 2)}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        timeout: 30000,
      },
    );

    const text = response.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    const parsed = safeJsonParse(text);
    const action = parsed?.action;

    if (
      action === "description" ||
      action === "social_links" ||
      action === "website_links" ||
      action === "stop"
    ) {
      if (!isAllowedAction(action, context, fallback)) {
        return fallback;
      }

      return {
        action,
        reason: parsed.reason ?? fallback.reason,
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function buildChannelContext(channel, videos = []) {
  const videoDescriptions = videos
    .map((video) => video.description)
    .filter(Boolean);
  const descriptionText = [channel.description, ...videoDescriptions].join("\n\n");
  const descriptionEmailCandidates = extractEmails(descriptionText).filter((email) =>
    isBusinessEmail(email, descriptionText),
  );
  const links = unique([
    ...extractLinks(descriptionText),
    ...channel.links,
  ]);
  const { socialLinks, websiteLinks } = splitLinks(links);

  return {
    channel: channel.channel,
    subscribers: channel.subscribers,
    descriptionText,
    descriptionEmailCandidates,
    socialLinks,
    websiteLinks,
  };
}

function mergeLinks(baseLinks = [], newLinks = []) {
  return unique([...baseLinks, ...newLinks]);
}

async function inspectLinks(links, fallbackSource = "website") {
  const discoveredLinks = [];
  const inspections = [];

  for (const link of links) {
    const source = sourceFromUrl(link) || fallbackSource;

    try {
      const page = await scrapePage(link);
      const bestEmail = pickBestEmail(
        page.emails,
        source,
        page.contentText,
      );

      inspections.push({
        url: link,
        source,
        outcome: bestEmail ? "email_found" : "no_email_found",
        emailsFound: page.emails.length,
        linksDiscovered: page.links.length,
      });

      if (bestEmail) {
        return {
          match: bestEmail,
          discoveredLinks,
          inspections,
        };
      }

      discoveredLinks.push(...page.links);
    } catch (error) {
      inspections.push({
        url: link,
        source,
        outcome: "scrape_failed",
        error: error.message,
      });
      continue;
    }
  }

  return {
    match: null,
    discoveredLinks: unique(discoveredLinks),
    inspections,
  };
}

function getChannelSkipReason(channel, minSubs, maxSubs) {
  if (channel.subscriberCountHidden) {
    return "Subscriber count is hidden, so the channel cannot be filtered reliably.";
  }

  if (channel.subscribers < minSubs) {
    return `Subscriber count is below the minimum threshold of ${minSubs}.`;
  }

  if (channel.subscribers > maxSubs) {
    return `Subscriber count is above the maximum threshold of ${maxSubs}.`;
  }

  return null;
}

function buildFinalReason(contextBase, agentState) {
  if (
    contextBase.descriptionEmailCandidates.length === 0 &&
    contextBase.socialLinks.length === 0 &&
    contextBase.websiteLinks.length === 0
  ) {
    return "No business email candidates or external links were found in the descriptions.";
  }

  if (
    contextBase.descriptionEmailCandidates.length === 0 &&
    agentState.socialLinks.length === 0 &&
    agentState.websiteLinks.length === 0
  ) {
    return "Descriptions did not include a business email, and there were no usable links to inspect.";
  }

  if (
    agentState.state.descriptionChecked &&
    agentState.state.socialLinksChecked &&
    agentState.state.websiteLinksChecked
  ) {
    return "Descriptions, social links, and websites were inspected, but no valid business email was found.";
  }

  if (agentState.state.descriptionChecked && !agentState.state.socialLinksChecked) {
    return "Description inspection finished without a valid email, and no social links were available.";
  }

  return "The agent finished its inspection path without finding a valid business email.";
}

function buildAlerts({
  videosFound,
  uniqueChannelsFound,
  fetchedChannels,
  eligibleChannels,
  evaluatedChannels,
  skippedChannels,
  resultsCount,
}) {
  const alerts = [];

  if (videosFound === 0) {
    alerts.push({
      type: "warning",
      title: "No videos found",
      message: "The YouTube search did not return any videos for this keyword. Try a broader query.",
    });
  }

  if (videosFound > 0 && uniqueChannelsFound === 0) {
    alerts.push({
      type: "warning",
      title: "No creator channels extracted",
      message: "Videos were returned, but no usable channel IDs were extracted from them.",
    });
  }

  if (fetchedChannels > 0 && eligibleChannels === 0) {
    alerts.push({
      type: "warning",
      title: "Filters removed every channel",
      message: "The search found channels, but none matched your subscriber range or some had hidden subscriber counts.",
    });
  }

  if (eligibleChannels > evaluatedChannels) {
    alerts.push({
      type: "info",
      title: "Run capped by inspection limits",
      message: `The agent found ${eligibleChannels} eligible channels, but only inspected ${evaluatedChannels} because of the current channel-per-run limit.`,
    });
  }

  if (evaluatedChannels > 0 && resultsCount === 0) {
    alerts.push({
      type: "info",
      title: "Inspection finished with no business emails",
      message: "At least one channel was inspected, but no valid business email survived the agent checks.",
    });
  }

  if (skippedChannels.length > 0) {
    alerts.push({
      type: "info",
      title: "Some channels were skipped",
      message: `${skippedChannels.length} channel(s) were skipped because of filters, hidden subscriber counts, or the per-run inspection cap.`,
    });
  }

  return alerts;
}

export async function runAgent(
  query,
  {
    minSubs = 0,
    maxSubs = Number.MAX_SAFE_INTEGER,
    maxVideos = 10,
    maxChannelsPerRun = 10,
    maxLinksPerChannel = 5,
  } = {},
) {
  const videos = await searchVideos(query, maxVideos);
  const videosByChannel = new Map();

  for (const video of videos) {
    if (!videosByChannel.has(video.channelId)) {
      videosByChannel.set(video.channelId, []);
    }

    videosByChannel.get(video.channelId).push(video);
  }

  const channelIds = [...videosByChannel.keys()];
  const channels = await getChannelStats(channelIds);
  const eligibleChannels = filterChannels(channels, minSubs, maxSubs);
  const filteredChannels = eligibleChannels.slice(
    0,
    Math.max(1, maxChannelsPerRun),
  );
  const results = [];
  const channelReports = [];
  const skippedChannels = [];

  for (const channel of channels) {
    const reason = getChannelSkipReason(channel, minSubs, maxSubs);

    if (reason) {
      skippedChannels.push({
        channel: channel.channel,
        subscribers: channel.subscribers,
        reason,
      });
    }
  }

  for (const channel of eligibleChannels.slice(filteredChannels.length)) {
    skippedChannels.push({
      channel: channel.channel,
      subscribers: channel.subscribers,
      reason: `Skipped because the current run inspects at most ${maxChannelsPerRun} channels.`,
    });
  }

  for (const channel of filteredChannels) {
    const contextBase = buildChannelContext(
      channel,
      videosByChannel.get(channel.channelId) ?? [],
    );

    const agentState = {
      foundEmail: false,
      previousActions: [],
      socialLinks: contextBase.socialLinks,
      websiteLinks: contextBase.websiteLinks,
      state: {
        descriptionChecked: false,
        socialLinksChecked: false,
        websiteLinksChecked: false,
      },
    };
    const report = {
      channel: channel.channel,
      subscribers: channel.subscribers,
      videoCount: (videosByChannel.get(channel.channelId) ?? []).length,
      descriptionEmailCandidates: contextBase.descriptionEmailCandidates.length,
      descriptionChecked: false,
      socialLinksAvailable: contextBase.socialLinks.length,
      websiteLinksAvailable: contextBase.websiteLinks.length,
      inspectedLinks: [],
      actions: [],
      status: "inspecting",
      finalReason: "",
    };

    let chosenResult = null;

    for (let step = 0; step < 6; step += 1) {
      const nextStep = await decideNextStep({
        channel: channel.channel,
        subscribers: channel.subscribers,
        foundEmail: agentState.foundEmail,
        state: agentState.state,
        descriptionEmailCandidates: contextBase.descriptionEmailCandidates,
        socialLinks: agentState.socialLinks,
        websiteLinks: agentState.websiteLinks,
        previousActions: agentState.previousActions,
      });

      agentState.previousActions.push(nextStep.action);
      report.actions.push({
        action: nextStep.action,
        reason: nextStep.reason,
      });

      if (nextStep.action === "stop") {
        break;
      }

      if (nextStep.action === "description") {
        agentState.state.descriptionChecked = true;
        report.descriptionChecked = true;

        const bestEmail = pickBestEmail(
          contextBase.descriptionEmailCandidates,
          "description",
          contextBase.descriptionText,
        );

        if (bestEmail) {
          chosenResult = {
            channel: channel.channel,
            subscribers: channel.subscribers,
            email: bestEmail.email,
            source: "description",
            confidence: bestEmail.confidence,
          };
          report.status = "lead_found";
          report.finalReason = "A valid business email was found directly in the description content.";
          agentState.foundEmail = true;
          break;
        }

        continue;
      }

      if (nextStep.action === "social_links") {
        agentState.state.socialLinksChecked = true;

        const socialInspection = await inspectLinks(
          agentState.socialLinks.slice(0, Math.max(1, maxLinksPerChannel)),
          "website",
        );
        const discoveredFromSocial = splitLinks(socialInspection.discoveredLinks);
        report.inspectedLinks.push(...socialInspection.inspections);
        agentState.socialLinks = mergeLinks(
          agentState.socialLinks,
          discoveredFromSocial.socialLinks,
        );
        agentState.websiteLinks = mergeLinks(
          agentState.websiteLinks,
          discoveredFromSocial.websiteLinks,
        );

        if (socialInspection.match) {
          chosenResult = {
            channel: channel.channel,
            subscribers: channel.subscribers,
            email: socialInspection.match.email,
            source: socialInspection.match.source,
            confidence: socialInspection.match.confidence,
          };
          report.status = "lead_found";
          report.finalReason = `A valid business email was found after scraping social or profile links.`;
          agentState.foundEmail = true;
          break;
        }

        continue;
      }

      if (nextStep.action === "website_links") {
        agentState.state.websiteLinksChecked = true;

        const websiteInspection = await inspectLinks(
          agentState.websiteLinks.slice(0, Math.max(1, maxLinksPerChannel)),
          "website",
        );
        report.inspectedLinks.push(...websiteInspection.inspections);

        if (websiteInspection.match) {
          chosenResult = {
            channel: channel.channel,
            subscribers: channel.subscribers,
            email: websiteInspection.match.email,
            source: websiteInspection.match.source,
            confidence: websiteInspection.match.confidence,
          };
          report.status = "lead_found";
          report.finalReason = "A valid business email was found on an external website.";
          agentState.foundEmail = true;
          break;
        }
      }
    }

    if (chosenResult) {
      results.push(chosenResult);
    } else {
      report.status = "no_email_found";
      report.finalReason = buildFinalReason(contextBase, agentState);
    }

    channelReports.push(report);
  }

  const alerts = buildAlerts({
    videosFound: videos.length,
    uniqueChannelsFound: channelIds.length,
    fetchedChannels: channels.length,
    eligibleChannels: eligibleChannels.length,
    evaluatedChannels: filteredChannels.length,
    skippedChannels,
    resultsCount: results.length,
  });

  return {
    results,
    meta: {
      query,
      maxVideosUsed: maxVideos,
      videosFound: videos.length,
      uniqueChannelsFound: channelIds.length,
      channelsFetched: channels.length,
      channelsMatchingFilters: eligibleChannels.length,
      channelsEvaluated: filteredChannels.length,
      maxChannelsPerRun,
      maxLinksPerChannel,
      skippedChannels,
      channelReports,
      alerts,
    },
  };
}
