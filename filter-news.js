// Fetches recent articles from RSS feeds, then asks Claude (via the API)
// to pick out the most interesting ones for an intelligence-focused blog.

require("dotenv").config(); // loads your API key from the .env file
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

// Step 1: Gather headlines + summaries from all feeds into one list
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

// Step 2: Send the list to Claude and ask it to pick the most interesting ones
async function askClaudeToFilter(articles) {
  // Build a simple text list of all articles for Claude to read
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   Summary: ${a.summary}`)
    .join("\n\n");

  const prompt = `Here is a list of recent articles from intelligence and security-related news sources:

${articleList}

I'm writing a personal blog about intelligence, espionage, and national security topics. From this list, pick the 3 most interesting or blog-worthy articles. For each one, give the article number and a one-sentence reason why it's worth writing about.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

async function main() {
  console.log("Fetching articles from feeds...\n");
  const articles = await gatherArticles();

  console.log(`Found ${articles.length} articles. Asking Claude to pick the best ones...\n`);
  const result = await askClaudeToFilter(articles);

  console.log("=== Claude's picks ===\n");
  console.log(result);
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
});