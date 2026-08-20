// Fetches recent articles from RSS feeds, asks Claude to pick the 2 most
// interesting ones from EACH source, and writes the result as a webpage (index.html)

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
  { name: "ERR News (English)", url: "https://news.err.ee/rss" },
  { name: "ERR News (Russian)", url: "https://rus.err.ee/rss" },
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
  // Group articles by source so Claude sees them clearly separated
  const grouped = {};
  articles.forEach((a) => {
    if (!grouped[a.source]) grouped[a.source] = [];
    grouped[a.source].push(a);
  });

  const articleList = Object.entries(grouped)
    .map(([source, items]) => {
      const itemText = items
        .map((a, i) => `  ${i + 1}. ${a.title}\n     Link: ${a.link}\n     Summary: ${a.summary}`)
        .join("\n\n");
      return `=== ${source} ===\n${itemText}`;
    })
    .join("\n\n");

  const prompt = `Here is a list of recent articles from intelligence and security-related news sources, grouped by source:

${articleList}

I'm writing a personal blog about intelligence, espionage, and national security topics. Pick exactly 2 articles from EACH source listed above — no more, no less per source.

Only pick ERR articles if they specifically relate to defense, security, or Estonian-Russian relations. If a source has fewer than 2 qualifying articles, pick whatever is available and note why.

Some articles are in Russian — for those, write your reasoning in English regardless of the original language.

Respond ONLY in this exact format, one block per pick, nothing else before or after:

SOURCE: [source name]
TITLE: [the article title, translated to English if it was in Russian]
LINK: [the article link]
REASON: [one sentence on why it's worth writing about, in English]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

function parsePicks(rawText) {
  const blocks = rawText.trim().split(/\n(?=SOURCE:)/);
  return blocks.map((block) => {
    const source = block.match(/SOURCE:\s*(.*)/)?.[1] || "Unknown";
    const title = block.match(/TITLE:\s*(.*)/)?.[1] || "Untitled";
    const link = block.match(/LINK:\s*(.*)/)?.[1] || "#";
    const reason = block.match(/REASON:\s*(.*)/)?.[1] || "";
    return { source, title, link, reason };
  });
}

function buildHtml(picks) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Group picks by source for display
  const grouped = {};
  picks.forEach((p) => {
    if (!grouped[p.source]) grouped[p.source] = [];
    grouped[p.source].push(p);
  });

  const sectionsHtml = Object.entries(grouped)
    .map(([source, items]) => {
      const itemsHtml = items
        .map(
          (p) => `
      <div class="pick">
        <h3><a href="${p.link}" target="_blank">${p.title}</a></h3>
        <p>${p.reason}</p>
      </div>`
        )
        .join("\n");

      return `
    <div class="source-section">
      <h2 class="source-label">${source}</h2>
      ${itemsHtml}
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Today's Intelligence Picks</title>
  <style>
    body {
      font-family: Georgia, serif;
      max-width: 750px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      background: #faf8f4;
      color: #1a1a1a;
      line-height: 1.6;
    }
    h1 { font-size: 1.8rem; margin-bottom: 0; }
    .date { color: #6b6b6b; margin-top: 0.25rem; margin-bottom: 2.5rem; }
    .source-section {
      margin-bottom: 2.5rem;
    }
    .source-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #7a2e2e;
      border-bottom: 2px solid #7a2e2e;
      padding-bottom: 0.4rem;
      margin-bottom: 1rem;
    }
    .pick {
      padding: 1rem 0;
      border-bottom: 1px solid #e8e4de;
    }
    .pick:last-child { border-bottom: none; }
    .pick h3 { font-size: 1.1rem; margin-bottom: 0.4rem; }
    .pick a { color: #1a1a1a; text-decoration: none; }
    .pick a:hover { color: #7a2e2e; }
    .pick p { color: #444; margin: 0; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Today's Intelligence Picks</h1>
  <p class="date">${today}</p>
  ${sectionsHtml}
</body>
</html>
`;
}

async function main() {
  console.log("Fetching articles...");
  const articles = await gatherArticles();

  console.log(`Found ${articles.length} articles across ${[...new Set(articles.map(a => a.source))].length} sources. Asking Claude to pick the best ones...`);
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
