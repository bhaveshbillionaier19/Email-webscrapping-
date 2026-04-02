const EMAIL_REGEX =
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

const URL_REGEX =
  /\b(?:https?:\/\/|www\.)[^\s<>"')\]}]+/gi;

const BLOCKED_LOCAL_PARTS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "privacy",
  "abuse",
  "spam",
];

const BLOCKED_DOMAINS = [
  "example.com",
  "test.com",
  "yourdomain.com",
];

const BUSINESS_HINTS = [
  "business",
  "contact",
  "collab",
  "collaboration",
  "partnership",
  "partner",
  "sponsor",
  "sponsorship",
  "booking",
  "bookings",
  "brand",
  "media",
  "press",
  "inquiry",
  "inquiries",
  "team",
  "hello",
  "work",
];

const SOCIAL_DOMAINS = [
  "instagram.com",
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "stan.store",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "threads.net",
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeUrl(url) {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("www.")) {
    return `https://${url}`;
  }

  return null;
}

export function extractEmails(text = "") {
  if (!text) {
    return [];
  }

  const matches = text.match(EMAIL_REGEX) ?? [];
  const cleaned = matches.map((email) =>
    email.toLowerCase().replace(/[),.;:!?]+$/g, ""),
  );

  return unique(cleaned);
}

export function extractLinks(text = "") {
  if (!text) {
    return [];
  }

  const matches = text.match(URL_REGEX) ?? [];

  return unique(
    matches
      .map((url) => normalizeUrl(url.replace(/[),.;:!?]+$/g, "")))
      .filter(Boolean),
  );
}

export function isBusinessEmail(email, contextText = "") {
  if (!email) {
    return false;
  }

  const lowerEmail = email.toLowerCase();
  const [localPart = "", domain = ""] = lowerEmail.split("@");
  const lowerContext = contextText.toLowerCase();

  if (!localPart || !domain) {
    return false;
  }

  if (BLOCKED_DOMAINS.includes(domain)) {
    return false;
  }

  if (BLOCKED_LOCAL_PARTS.some((part) => localPart.includes(part))) {
    return false;
  }

  if (localPart.length < 2) {
    return false;
  }

  if (lowerContext.includes("personal email only")) {
    return false;
  }

  return true;
}

export function scoreEmailCandidate(email, source, contextText = "") {
  const lowerEmail = email.toLowerCase();
  const [localPart = "", domain = ""] = lowerEmail.split("@");
  const lowerContext = contextText.toLowerCase();

  let score = 0.55;

  if (source === "description") {
    score += 0.2;
  }

  if (source === "website") {
    score += 0.15;
  }

  if (source === "instagram" || source === "linktree") {
    score += 0.1;
  }

  if (BUSINESS_HINTS.some((hint) => lowerContext.includes(hint))) {
    score += 0.15;
  }

  if (BUSINESS_HINTS.some((hint) => localPart.includes(hint))) {
    score += 0.1;
  }

  if (domain.endsWith("gmail.com") || domain.endsWith("yahoo.com")) {
    score -= 0.05;
  }

  return Number(clamp(score, 0.1, 0.99).toFixed(2));
}

export function pickBestEmail(emails, source, contextText = "") {
  const candidates = emails
    .filter((email) => isBusinessEmail(email, contextText))
    .map((email) => ({
      email,
      source,
      confidence: scoreEmailCandidate(email, source, contextText),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return candidates[0] ?? null;
}

export function splitLinks(links = []) {
  const socialLinks = [];
  const websiteLinks = [];

  for (const link of unique(links)) {
    try {
      const domain = new URL(link).hostname.replace(/^www\./, "");

      if (SOCIAL_DOMAINS.some((socialDomain) => domain.endsWith(socialDomain))) {
        socialLinks.push(link);
      } else {
        websiteLinks.push(link);
      }
    } catch {
      websiteLinks.push(link);
    }
  }

  return {
    socialLinks: unique(socialLinks),
    websiteLinks: unique(websiteLinks),
  };
}

export function sourceFromUrl(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");

    if (domain.includes("instagram.com")) {
      return "instagram";
    }

    if (domain.includes("linktr.ee") || domain.includes("linktree.com")) {
      return "linktree";
    }
  } catch {
    return "website";
  }

  return "website";
}
