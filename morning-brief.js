require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const todayDate = new Date();
const todayStr = todayDate.toISOString().split("T")[0]; // e.g. "2026-08-18"
const todayFormatted = todayDate.toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});

// ─── PASS 1: Research and extract claims ─────────────────────────────────────

async function extractClaims() {
  console.log("Pass 1: Researching and extracting claims...");

  const prompt = `You are an intelligence analyst. Today is ${todayFormatted}. Research the following focus areas and identify significant claims or developments worth reporting:

1. Russian Special Services (FSB, SVR, GRU)
2. Russia vs NATO, particularly the Baltic region
3. OSINT & open source intelligence developments

For each significant claim you find, return it in this exact format — do not write a report yet, just extract claims:

CLAIM: [one sentence stating the claim factually]
SOURCE: [publication name]
URL: [direct link]
PUBLISHED: [date the source article was published]
SOURCE_TYPE: [investigative journalism / official statement / state media / think tank / wire service]
CREDIBILITY: [High / Medium / Low]
TOPIC: [Russian Special Services / Russia vs NATO / OSINT]

Only include claims from articles or reports published within the last 24-48 hours. If you find something significant but it's older than 48 hours, do not include it — note in your search that you're specifically looking for the most recent developments, not historical context.

For each claim, include the publish date of the source article. If you cannot determine when something was published, do not include it.

Only include claims that are genuinely newsworthy and specific. Drop vague or filler observations. Aim for 5-10 claims total across all topics. Leave a blank line between each claim block.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log(`Pass 1 complete.\n`);
  return text;
}

// ─── PASS 2: Corroborate and write report ────────────────────────────────────

async function corroborateAndWrite(claims) {
  console.log("Pass 2: Corroborating claims and writing report...");

  const prompt = `You are an intelligence analyst. Today is ${todayFormatted}.

Here is a list of claims extracted from initial research:

${claims}

For each claim, search for corroboration from additional independent sources — different organizations, ideally different countries or source types. State media outlets from the same country do NOT count as independent corroboration.

Assign confidence ratings STRICTLY by source count only — not by how confident you feel:
- 🟢 Confirmed — you found AND cited 3 or more URLs from independent organizations
- 🟠 Probable — you found AND cited exactly 2 URLs from independent organizations
- 🟡 Possible — you found AND cited exactly 1 URL
- 🔴 Contested — sources directly contradict each other, cite both sides
- If you cannot find a second source to cite, the rating MUST be 🟡, never 🟢 or 🟠
- Count your actual citations before assigning the flag — if you see only 1 link in your text for that claim, it MUST be 🟡

Writing rules based on rating:
- 🟢 Confirmed — full paragraph with detailed analysis, all sources cited inline as markdown hyperlinks [text](url)
- 🟠 Probable — 2-3 sentences maximum, both sources cited inline as markdown hyperlinks
- 🟡 Possible — one sentence only, prefixed with "UNCONFIRMED:", source cited inline
- 🔴 Contested — one sentence noting the contradiction, both sides cited inline
- Omit entirely anything that cannot be corroborated from at least one credible source

Return in this exact format:

SECTION: Russian Special Services
CONTENT: [written report with inline markdown hyperlinks and rating indicators]

SECTION: Russia vs NATO
CONTENT: [written report]

SECTION: OSINT Developments
CONTENT: [written report]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text;
}

// ─── Parse sections ───────────────────────────────────────────────────────────

function parseSections(rawText) {
  const sections = [];
  const blocks = rawText.trim().split(/\n(?=SECTION:)/);

  blocks.forEach((block) => {
    const titleMatch = block.match(/SECTION:\s*(.*)/);
    const contentMatch = block.match(/CONTENT:\s*([\s\S]*)/);
    if (titleMatch && contentMatch) {
      sections.push({
        title: titleMatch[1].trim(),
        content: contentMatch[1].trim(),
      });
    }
  });

  return sections;
}

// ─── Markdown to HTML ─────────────────────────────────────────────────────────

function markdownToHtml(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/UNCONFIRMED:/g, '<span class="unconfirmed">UNCONFIRMED:</span>');
}

// ─── Get last 10 available brief dates from the output folder ─────────────────

function getArchiveDates(outputDir) {
  const files = fs.readdirSync(outputDir);
  return files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(".html", ""))
    .sort()
    .reverse()
    .slice(0, 10);
}

// ─── Build sidebar HTML ───────────────────────────────────────────────────────

function buildSidebar(dates, currentDate) {
  const items = dates.map((d) => {
    const label = new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const isActive = d === currentDate;
    return `<a href="${d}.html" class="archive-link ${isActive ? "active" : ""}">${label}</a>`;
  });

  return `
  <aside class="sidebar">
    <h3>Archive</h3>
    ${items.join("\n    ")}
  </aside>`;
}

// ─── Build full HTML page ─────────────────────────────────────────────────────

function buildHtml(sections, archiveDates) {
  const sectionsHtml = sections
    .map((s) => {
      const paragraphs = s.content
        .split(/\n\n+/)
        .filter(Boolean)
        .map((p) => `<p>${markdownToHtml(p.trim())}</p>`)
        .join("\n");

      return `
    <div class="section">
      <h2>${s.title}</h2>
      <div class="content">${paragraphs}</div>
    </div>`;
    })
    .join("\n");

  const sidebar = buildSidebar(archiveDates, todayStr);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Morning Intelligence Brief — ${todayFormatted}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, serif;
      background: #faf8f4;
      color: #1a1a1a;
      line-height: 1.7;
      margin: 0;
      padding: 0;
    }
    .layout {
      display: flex;
      max-width: 1000px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      gap: 3rem;
    }
    .main { flex: 1; min-width: 0; }
    .sidebar {
      width: 160px;
      flex-shrink: 0;
    }
    .sidebar h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #7a2e2e;
      margin-bottom: 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 2px solid #7a2e2e;
    }
    .archive-link {
      display: block;
      font-size: 0.85rem;
      color: #555;
      text-decoration: none;
      padding: 0.4rem 0;
      border-bottom: 1px solid #e8e4de;
    }
    .archive-link:hover { color: #7a2e2e; }
    .archive-link.active {
      color: #1a1a1a;
      font-weight: bold;
    }
    .header {
      border-bottom: 3px solid #1a1a1a;
      padding-bottom: 1rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    .date { color: #6b6b6b; font-size: 0.9rem; margin: 0; }
    .classification {
      font-size: 0.75rem;
      letter-spacing: 2px;
      color: #7a2e2e;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    .legend {
      background: #f0ede8;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 0.75rem 1rem;
      margin-bottom: 2rem;
      font-size: 0.82rem;
      color: #555;
      line-height: 2;
    }
    .section {
      margin-bottom: 2.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid #ddd;
    }
    .section:last-child { border-bottom: none; }
    .section h2 {
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #7a2e2e;
      margin-bottom: 1rem;
    }
    .content p { margin: 0 0 1rem 0; }
    .content a { color: #7a2e2e; text-decoration: underline; }
    .content a:hover { color: #1a1a1a; }
    .unconfirmed {
      font-size: 0.75rem;
      font-weight: bold;
      letter-spacing: 1px;
      color: #999;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #ddd;
      font-size: 0.8rem;
      color: #999;
    }
    @media (max-width: 600px) {
      .layout { flex-direction: column-reverse; }
      .sidebar { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <main class="main">
      <div class="header">
        <p class="classification">Morning Intelligence Brief</p>
        <h1>Daily Situation Report</h1>
        <p class="date">${todayFormatted}</p>
      </div>

      <div class="legend">
        <strong>Confidence ratings:</strong><br>
        🟢 Confirmed — 3+ independent sources &nbsp;|&nbsp;
        🟠 Probable — 2 independent sources &nbsp;|&nbsp;
        🟡 Possible — 1 credible source &nbsp;|&nbsp;
        🔴 Contested — sources contradict
      </div>

      ${sectionsHtml}

      <div class="footer">
        Generated ${todayFormatted} · Research via open sources · Two-pass corroboration
      </div>
    </main>

    ${sidebar}
  </div>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Generating morning intelligence brief for ${todayStr}...\n`);

  const claims = await extractClaims();
  const report = await corroborateAndWrite(claims);
  const sections = parseSections(report);

  if (sections.length === 0) {
    console.log("Warning: could not parse sections. Raw output:");
    console.log(report);
    return;
  }

  const outputDir = __dirname;

  // Save today's brief as its own dated file
  const todayFile = path.join(outputDir, `${todayStr}.html`);

  // Get archive dates BEFORE writing today's file, then add today
  let archiveDates = getArchiveDates(outputDir);
  if (!archiveDates.includes(todayStr)) {
    archiveDates = [todayStr, ...archiveDates].slice(0, 10);
  }

  const html = buildHtml(sections, archiveDates);

  // Write today's dated file
  fs.writeFileSync(todayFile, html);
  console.log(`Saved: ${todayStr}.html`);

  // Also write index.html (always points to today's content)
  const indexPath = path.join(outputDir, "index.html");
  fs.writeFileSync(indexPath, html);
  console.log(`Updated: index.html`);

  console.log(`\nDone. Open in browser:\nfile://${indexPath}`);
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
});