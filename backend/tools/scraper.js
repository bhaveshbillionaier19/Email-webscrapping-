import { chromium } from "playwright";
import { extractEmails, extractLinks } from "./email.js";

export async function scrapePage(url) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const pageData = await page.evaluate(() => {
      const anchorHrefs = Array.from(document.querySelectorAll("a"))
        .map((anchor) => anchor.href)
        .filter(Boolean);

      return {
        bodyText: document.body?.innerText ?? "",
        html: document.documentElement?.outerHTML ?? "",
        anchorHrefs,
      };
    });

    const combinedText = [
      pageData.bodyText,
      pageData.html,
      ...pageData.anchorHrefs,
    ].join("\n");

    const links = Array.from(
      new Set([
        ...extractLinks(pageData.bodyText),
        ...extractLinks(pageData.html),
        ...pageData.anchorHrefs.filter((href) => href.startsWith("http")),
      ]),
    );

    return {
      url: page.url(),
      emails: extractEmails(combinedText),
      links,
      contentText: pageData.bodyText,
    };
  } finally {
    await browser.close();
  }
}
