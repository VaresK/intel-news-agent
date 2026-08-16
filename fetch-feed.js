// Fetches recent articles from multiple intelligence/security-related RSS feeds
// and prints title, link, date, and a short summary for each.

const Parser = require("rss-parser");
const parser = new Parser();

// Add as many feeds here as you like — just name + url.
const feeds = [
  { name: "Bellingcat", url: "https://www.bellingcat.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
];

async function fetchFeed(feedInfo) {
  console.log(`\n=== ${feedInfo.name} ===\n`);

  try {
    const feed = await parser.parseURL(feedInfo.url);

    feed.items.slice(0, 3).forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}`);
      console.log(`   Link: ${item.link}`);
      console.log(`   Date: ${item.pubDate}`);

      // contentSnippet is a plain-text excerpt/summary, when the feed provides one
      if (item.contentSnippet) {
        const shortSummary = item.contentSnippet.slice(0, 200).trim();
        console.log(`   Summary: ${shortSummary}...`);
      }

      // Some feeds tag articles with categories/topics
      if (item.categories && item.categories.length > 0) {
        console.log(`   Categories: ${item.categories.join(", ")}`);
      }

      console.log(""); // blank line between articles
    });
  } catch (err) {
    console.log(`   Could not fetch this feed: ${err.message}`);
  }
}

async function main() {
  for (const feed of feeds) {
    await fetchFeed(feed);
  }
}

main();