// Fetches recent articles from RSS feeds, asks Claude to pick the 3 most
// interesting ones, and writes the result as a simple webpage (daily-picks.html)
// that you can open in your browser.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");
const Anthropic = require("@anthropic-ai/sdk");

const parser = new Parser();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const feeds = [
  { name: "Bellingcat", url: "https://www.bellingcat.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
];

async function gatherArticles() {
  const allArticles = [];

  for (const feedInfo of feeds) {
    try {
      const feed = await parser.parseURL(feedInfo.url);
      feed.items.slice(0, 5).forEach((item) => {
        allArticles.push({
          source: feedInfo.name,
          title: item.title,
          link: item.link,
          summary: item.contentSnippet ? item.contentSnippet.slice(0, 300) : "",
        });
      });
    } catch (err) {
      console.log(`Could not fetch ${feedInfo.name}: ${err.message}`);
    }
  }

  return allArticles;
}

async function askClaudeToFilter(articles) {
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   Link: ${a.link}\n   Summary: ${a.summary}`)
    .join("\n\n");

  const prompt = `Here is a list of recent articles from intelligence and security-related news sources:

${articleList}

I'm writing a personal blog about intelligence, espionage, and national security topics. From this list, pick the 3 most interesting or blog-worthy articles.

Respond ONLY in this exact format, one block per pick, nothing else before or after:

TITLE: [the article title]
LINK: [the article link]
REASON: [one sentence on why it's worth writing about]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

// Turns Claude's plain-text response into an array of {title, link, reason} objects
function parsePicks(rawText) {
  const blocks = rawText.trim().split(/\n(?=TITLE:)/);
  return blocks.map((block) => {
    const title = block.match(/TITLE:\s*(.*)/)?.[1] || "Untitled";
    const link = block.match(/LINK:\s*(.*)/)?.[1] || "#";
    const reason = block.match(/REASON:\s*(.*)/)?.[1] || "";
    return { title, link, reason };
  });
}

function buildHtml(picks) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const picksHtml = picks
    .map(
      (p) => `
    <div class="pick">
      <h2><a href="${p.link}" target="_blank">${p.title}</a></h2>
      <p>${p.reason}</p>
    </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Today's Intelligence Picks</title>
  <style>
    body {
      font-family: Georgia, serif;
      max-width: 700px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      background: #faf8f4;
      color: #1a1a1a;
      line-height: 1.6;
    }
    h1 { font-size: 1.8rem; margin-bottom: 0; }
    .date { color: #6b6b6b; margin-top: 0.25rem; margin-bottom: 2rem; }
    .pick {
      padding: 1.5rem 0;
      border-bottom: 1px solid #ddd;
    }
    .pick h2 { font-size: 1.2rem; margin-bottom: 0.5rem; }
    .pick a { color: #7a2e2e; text-decoration: none; }
    .pick a:hover { text-decoration: underline; }
    .pick p { color: #333; margin: 0; }
  </style>
</head>
<body>
  <h1>Today's Intelligence Picks</h1>
  <p class="date">${today}</p>
  ${picksHtml}
</body>
</html>
`;
}

async function main() {
  console.log("Fetching articles...");
  const articles = await gatherArticles();

  console.log("Asking Claude to pick the best ones...");
  const rawPicks = await askClaudeToFilter(articles);
  const picks = parsePicks(rawPicks);

  const html = buildHtml(picks);
  const outputPath = path.join(__dirname, "index.html");
  fs.writeFileSync(outputPath, html);

  console.log(`Done. Open this file in your browser:\n${outputPath}`);
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
});
