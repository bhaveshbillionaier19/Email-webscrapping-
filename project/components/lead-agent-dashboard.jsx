"use client";

import { useState } from "react";

const DEFAULT_FORM = {
  query: "AI tools",
  minSubs: 10000,
  maxSubs: 200000,
  maxVideos: 10,
};

const DEFAULT_RATE_LIMIT = {
  limit: 10,
  remaining: 10,
  resetAt: null,
  retryAfterSeconds: null,
};

const DEFAULT_RUNTIME_LIMITS = {
  maxVideosPerRun: 10,
  maxChannelsPerRun: 10,
  maxLinksPerChannel: 5,
};

const SEARCH_STEPS = [
  "Searching YouTube videos",
  "Collecting channel statistics",
  "Checking descriptions and links",
  "Scraping likely contact pages",
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatSource(source) {
  if (!source) {
    return "Unknown";
  }

  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatResetTime(value) {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function alertTone(type) {
  if (type === "warning") {
    return "border-[rgba(224,122,95,0.25)] bg-[rgba(224,122,95,0.10)]";
  }

  if (type === "success") {
    return "border-[rgba(15,118,110,0.25)] bg-[rgba(15,118,110,0.10)]";
  }

  return "border-[var(--line)] bg-white/70";
}

function formatInspectionOutcome(outcome) {
  if (outcome === "email_found") {
    return "Email found";
  }

  if (outcome === "scrape_failed") {
    return "Scrape failed";
  }

  return "No email found";
}

export default function LeadAgentDashboard() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [results, setResults] = useState([]);
  const [agentMeta, setAgentMeta] = useState(null);
  const [rateLimit, setRateLimit] = useState(DEFAULT_RATE_LIMIT);
  const [runtimeLimits, setRuntimeLimits] = useState(DEFAULT_RUNTIME_LIMITS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState(DEFAULT_FORM.query);
  const alerts = agentMeta?.alerts ?? [];
  const channelReports = agentMeta?.channelReports ?? [];
  const skippedChannels = agentMeta?.skippedChannels ?? [];

  const totalSubscribers = results.reduce(
    (sum, lead) => sum + Number(lead.subscribers || 0),
    0,
  );

  const highestConfidence = results.reduce((max, lead) => {
    const confidence = Number(lead.confidence || 0);
    return confidence > max ? confidence : max;
  }, 0);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: name === "query" ? value : Number(value),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        API_BASE_URL ? `${API_BASE_URL}/run-agent` : "/run-agent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      const payload = await response.json();

      if (payload.rateLimit) {
        setRateLimit(payload.rateLimit);
      }

      if (payload.limits) {
        setRuntimeLimits(payload.limits);
      }

      if (!response.ok) {
        throw new Error(payload.error || "Unable to run the agent.");
      }

      setResults(Array.isArray(payload) ? payload : payload.results ?? []);
      setAgentMeta(payload.meta ?? null);
      setLastQuery(form.query);
    } catch (submitError) {
      setResults([]);
      setAgentMeta(null);
      setError(submitError.message || "Unable to run the agent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="glass-panel grid-wash overflow-hidden rounded-[2rem] p-6 sm:p-8 lg:p-10">
            <div className="fade-in-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--teal)]">
                Creator Lead Agent
                <span className="h-2 w-2 rounded-full bg-[var(--coral)]" />
              </div>

              <div className="mt-6 max-w-3xl">
                <h1 className="text-4xl leading-tight font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-5xl lg:text-6xl">
                  Email id fetching Ai agent
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  This dashboard runs your Gemini-guided scraping agent behind a
                  simple workflow. Search a niche, filter creators by audience
                  size, and surface contact emails from descriptions, social
                  links, and websites in one place.
                </p>
              </div>
            </div>

            <form
              className="mt-8 grid gap-4 rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-5 sm:grid-cols-2 sm:p-6"
              onSubmit={handleSubmit}
            >
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--ink)]">
                  Keyword
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[#fcfbf7] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-4 focus:ring-[rgba(15,118,110,0.14)]"
                  name="query"
                  onChange={handleChange}
                  placeholder="AI tools"
                  required
                  suppressHydrationWarning
                  value={form.query}
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--ink)]">
                  Min subscribers
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[#fcfbf7] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-4 focus:ring-[rgba(15,118,110,0.14)]"
                  min="0"
                  name="minSubs"
                  onChange={handleChange}
                  suppressHydrationWarning
                  type="number"
                  value={form.minSubs}
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--ink)]">
                  Max subscribers
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[#fcfbf7] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-4 focus:ring-[rgba(15,118,110,0.14)]"
                  min="1"
                  name="maxSubs"
                  onChange={handleChange}
                  suppressHydrationWarning
                  type="number"
                  value={form.maxSubs}
                />
              </label>

              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--ink)]">
                  Number of videos
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[#fcfbf7] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-4 focus:ring-[rgba(15,118,110,0.14)]"
                  max={runtimeLimits.maxVideosPerRun}
                  min="1"
                  name="maxVideos"
                  onChange={handleChange}
                  suppressHydrationWarning
                  type="number"
                  value={form.maxVideos}
                />
              </label>

              <div className="sm:col-span-2 flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--muted)]">
                  The agent checks descriptions first, then social links, then
                  websites, and stops once it finds a solid business email. Each
                  user can run up to {rateLimit.limit} searches per window.
                </p>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || rateLimit.remaining === 0}
                  suppressHydrationWarning
                  type="submit"
                >
                  {loading
                    ? "Running Agent..."
                    : rateLimit.remaining === 0
                      ? "Rate Limit Reached"
                      : "Run Agent"}
                </button>
              </div>
            </form>
          </div>

          <aside className="space-y-5">
            <div className="glass-panel rounded-[2rem] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--teal)]">
                    Live Status
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                    {loading
                      ? "Agent is working through your lead list."
                      : rateLimit.remaining === 0
                        ? "Usage cap reached for this window."
                        : "Ready for a client-facing demo."}
                  </h2>
                </div>
                <div
                  className={`mt-1 h-3 w-3 rounded-full ${
                    loading
                      ? "bg-[var(--gold)]"
                      : rateLimit.remaining === 0
                        ? "bg-[var(--coral)]"
                        : "bg-[var(--teal)]"
                  }`}
                />
              </div>

              <div className="mt-6 grid gap-3">
                {SEARCH_STEPS.map((step, index) => (
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3"
                    key={step}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        loading && index === 1
                          ? "pulse-line bg-[var(--gold)]/30 text-[var(--ink)]"
                          : "bg-[var(--teal-soft)] text-[var(--teal)]"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="text-sm text-[var(--ink)]">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
              <div className="glass-panel rounded-[1.75rem] p-5">
                <p className="text-sm text-[var(--muted)]">Last keyword</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {lastQuery}
                </p>
              </div>
              <div className="glass-panel rounded-[1.75rem] p-5">
                <p className="text-sm text-[var(--muted)]">Leads found</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {results.length}
                </p>
              </div>
              <div className="glass-panel rounded-[1.75rem] p-5">
                <p className="text-sm text-[var(--muted)]">Searches left</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {rateLimit.remaining}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Resets around {formatResetTime(rateLimit.resetAt)}
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-8 fade-in-up">
          <div className="glass-panel rounded-[2rem] p-6 sm:p-8">
            <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--teal)]">
                  Results
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                  Qualified creator leads
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  Each card shows the best email the agent found and where it
                  was discovered, so clients can understand exactly why the lead
                  is trustworthy.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-sm text-[var(--ink)]">
                  Total subscribers: {formatNumber(totalSubscribers)}
                </div>
                <div className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-sm text-[var(--ink)]">
                  Lead count: {results.length}
                </div>
                <div className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-sm text-[var(--ink)]">
                  Top confidence: {highestConfidence ? `${Math.round(highestConfidence * 100)}%` : "N/A"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-5 py-4 text-sm text-[var(--ink)]">
                Max videos per run: {runtimeLimits.maxVideosPerRun}
              </div>
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-5 py-4 text-sm text-[var(--ink)]">
                Max channels checked: {runtimeLimits.maxChannelsPerRun}
              </div>
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-5 py-4 text-sm text-[var(--ink)]">
                Max links per channel: {runtimeLimits.maxLinksPerChannel}
              </div>
            </div>

            {agentMeta ? (
              <div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-white/65 px-5 py-4 text-sm text-[var(--ink)]">
                Evaluated {agentMeta.channelsEvaluated} channels from{" "}
                {agentMeta.videosFound} returned video result(s) for "{agentMeta.query}".
                {" "}YouTube returned {agentMeta.uniqueChannelsFound} unique
                channel candidate(s), and {agentMeta.channelsMatchingFilters} matched
                your subscriber filters.
              </div>
            ) : null}

            {!loading && alerts.length > 0 ? (
              <div className="mt-6 grid gap-3">
                {alerts.map((alert, index) => (
                  <div
                    className={`rounded-[1.5rem] border px-5 py-4 text-sm text-[var(--ink)] ${alertTone(alert.type)}`}
                    key={`${alert.title}-${index}`}
                  >
                    <p className="font-semibold">{alert.title}</p>
                    <p className="mt-1 text-[var(--muted)]">{alert.message}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <div className="mt-6 rounded-[1.5rem] border border-[rgba(224,122,95,0.25)] bg-[rgba(224,122,95,0.10)] px-5 py-4 text-sm text-[var(--ink)]">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    className="rounded-[1.5rem] border border-[var(--line)] bg-white/80 p-5"
                    key={`loading-${index}`}
                  >
                    <div className="pulse-line h-4 w-32 rounded-full bg-[rgba(18,32,35,0.1)]" />
                    <div className="pulse-line mt-4 h-8 w-48 rounded-full bg-[rgba(18,32,35,0.08)]" />
                    <div className="pulse-line mt-6 h-4 w-full rounded-full bg-[rgba(18,32,35,0.08)]" />
                    <div className="pulse-line mt-3 h-4 w-3/4 rounded-full bg-[rgba(18,32,35,0.08)]" />
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && results.length > 0 ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {results.map((lead, index) => (
                  <article
                    className="rounded-[1.5rem] border border-[var(--line)] bg-white/85 p-5 transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(18,32,35,0.10)]"
                    key={`${lead.channel}-${lead.email}-${index}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-[var(--muted)]">Channel</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                          {lead.channel}
                        </h3>
                      </div>
                      <span className="rounded-full bg-[var(--teal-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                        {formatSource(lead.source)}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Subscribers
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                          {formatNumber(lead.subscribers)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Confidence
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                          {Math.round(Number(lead.confidence || 0) * 100)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Email
                      </p>
                      <a
                        className="mt-2 block break-all text-base font-medium text-[var(--teal)] underline decoration-[rgba(15,118,110,0.35)] underline-offset-4"
                        href={`mailto:${lead.email}`}
                      >
                        {lead.email}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {!loading && channelReports.length > 0 ? (
              <div className="mt-8">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--teal)]">
                    Inspection Details
                  </p>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                    What the agent checked for each channel
                  </h3>
                </div>

                <div className="mt-4 grid gap-4">
                  {channelReports.map((report, index) => (
                    <article
                      className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-5"
                      key={`${report.channel}-${index}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h4 className="text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                            {report.channel}
                          </h4>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {formatNumber(report.subscribers)} subscribers,{" "}
                            {report.videoCount} matched video result(s)
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--teal-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                          {report.status === "lead_found" ? "Lead found" : "No email found"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4 text-sm text-[var(--ink)]">
                          Description candidates: {report.descriptionEmailCandidates}
                        </div>
                        <div className="rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4 text-sm text-[var(--ink)]">
                          Social links available: {report.socialLinksAvailable}
                        </div>
                        <div className="rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4 text-sm text-[var(--ink)]">
                          Website links available: {report.websiteLinksAvailable}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[#fcfbf7] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Final status
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                          {report.finalReason}
                        </p>
                      </div>

                      {report.actions.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                            Agent decisions
                          </p>
                          <div className="mt-3 grid gap-3">
                            {report.actions.map((action, actionIndex) => (
                              <div
                                className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)]"
                                key={`${report.channel}-action-${actionIndex}`}
                              >
                                <span className="font-semibold">
                                  {action.action.replaceAll("_", " ")}
                                </span>
                                : {action.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {report.inspectedLinks.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                            Link inspections
                          </p>
                          <div className="mt-3 grid gap-3">
                            {report.inspectedLinks.map((item, itemIndex) => (
                              <div
                                className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)]"
                                key={`${report.channel}-inspection-${itemIndex}`}
                              >
                                <p className="font-medium break-all">{item.url}</p>
                                <p className="mt-1 text-[var(--muted)]">
                                  {formatSource(item.source)}: {formatInspectionOutcome(item.outcome)}
                                  {typeof item.emailsFound === "number"
                                    ? `, emails found ${item.emailsFound}`
                                    : ""}
                                  {typeof item.linksDiscovered === "number"
                                    ? `, links discovered ${item.linksDiscovered}`
                                    : ""}
                                </p>
                                {item.error ? (
                                  <p className="mt-1 text-[var(--coral)]">{item.error}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {!loading && skippedChannels.length > 0 ? (
              <div className="mt-8">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--teal)]">
                    Skipped Channels
                  </p>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                    Why some channels were not inspected
                  </h3>
                </div>

                <div className="mt-4 grid gap-3">
                  {skippedChannels.map((channel, index) => (
                    <div
                      className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-5 py-4 text-sm text-[var(--ink)]"
                      key={`${channel.channel}-${index}`}
                    >
                      <p className="font-semibold">
                        {channel.channel}{" "}
                        <span className="font-normal text-[var(--muted)]">
                          ({formatNumber(channel.subscribers)} subscribers)
                        </span>
                      </p>
                      <p className="mt-1 text-[var(--muted)]">{channel.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!loading && !error && results.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/55 px-6 py-12 text-center">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--teal)]">
                  {agentMeta ? "No leads found" : "Waiting for a search"}
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {agentMeta
                    ? "The run completed, but no qualified leads were returned."
                    : "Run the agent to populate this lead board."}
                </h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  {agentMeta
                    ? "Use the inspection details above to see whether the search was too narrow, the subscriber filters were too strict, or the checked pages simply did not expose a business email."
                    : "This section will fill with creator cards once the API returns matches from descriptions, Instagram pages, Linktree pages, or external websites."}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
