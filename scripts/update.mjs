// Holt die neuesten Beiträge aus den Newsfeeds und legt daraus die Tagesausgabe in news.json an.
// Läuft täglich per GitHub Actions (Node 20, keine Abhängigkeiten).
import { readFile, writeFile } from "node:fs/promises";

const FEEDS = [
  { name: "Good News", url: "https://goodnews.eu/feed/", lang: "de" },
  { name: "Good News Magazin", url: "https://www.good-news-magazin.de/feed/", lang: "de" },
  { name: "Positive News", url: "https://www.positive.news/feed/", lang: "en" },
  { name: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", lang: "en" },
  { name: "Reasons to be Cheerful", url: "https://reasonstobecheerful.world/feed/", lang: "en" },
];

const MAX_ITEMS = 12;
const MAX_PER_FEED = 4;
const MAX_AGE_HOURS = 72;
const KEEP_EDITIONS = 30;

// Beiträge mit diesen Feed-Kategorien werden übersprungen (Rückblicke, Bezahlinhalte, Politik).
const SKIP_CATEGORIES = ["this day in history", "on this day", "gnm+", "politik", "sponsored", "anzeige"];

// Erste passende Regel gewinnt. Geprüft werden nur Titel und Feed-Kategorien, der Anrisstext ist zu ungenau.
const TOPICS = [
  ["Tiere", /\b(tier|tiere|wildtier|vogel|vögel|wal|wale|delfin|hund|katze|elefant|bären|wolf|luchs|biene|insekt|schildkröte|animal|wildlife|bird|whale|dolphin|dog|cat|elephant|bees?|turtles?|species|art(en)?schutz|zoo)\b/i],
  ["Klima", /\b(klima|solar|wind(kraft|energie)?|erneuerbarw*|energiew*|e-auto|elektrow*|emissionw*|co2|fossilw*|climate|renewable|energy|electric|emissions|carbon|heat pump|wärmepumpe|batter(y|ie))\b/i],
  ["Natur", /\b(natur|wald|wälder|meer|ozean|fluss|moor|garten|baum|bäume|pflanze|rewilding|nature|forest|ocean|sea|river|tree|trees|lake|biodivers\w*|conservation|environment|umwelt|park)\b/i],
  ["Gesundheit", /\b(gesundheit|medizin|krebs|therapie|patient|klinik|krankheit|impf|health|medical|cancer|therapy|disease|vaccine|hospital|mental health|treatment|wirkstoff|endometriose|alzheimer|diabetes)\b/i],
  ["Wissenschaft", /\b(forsch\w*|wissenschaft\w*|studie|technolog\w*|research\w*|scientist\w*|study|technology|space|weltraum|archäolog\w*|archaeolog\w*|invent\w*|erfind\w*)\b/i],
  ["Gesellschaft", /./],
];

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()); // YYYY-MM-DD

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function text(html) {
  return decode(html)
    .replace(/<p>The post [\s\S]*?appeared first on[\s\S]*?<\/p>/gi, "")
    .replace(/The post [\s\S]*?appeared first on [^.]*\./gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(…|&#8230;|\.\.\.)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(s, max = 260) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 120 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ")) + " …";
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseFeed(xml, feed) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const raw = m[1];
    const categories = [...raw.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((c) => decode(c[1]).trim());
    const title = text(tag(raw, "title"));
    const url = decode(tag(raw, "link"));
    const date = new Date(tag(raw, "pubDate"));
    const summary = shorten(text(tag(raw, "description")));
    if (!title || !url || isNaN(date)) continue;
    items.push({ title, url, date, summary, categories, source: feed.name, lang: feed.lang });
  }
  return items;
}

function topicOf(item) {
  const hay = [item.title, item.categories.join(" ")].join(" ");
  return TOPICS.find(([, re]) => re.test(hay))[0];
}

async function load(feed) {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": "Lichtblick/1.0 (+https://github.com/melissanora7-ship-it/lichtblick)" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return parseFeed(await res.text(), feed);
  } catch (e) {
    console.warn(`Feed übersprungen: ${feed.name} (${e.message})`);
    return [];
  }
}

const data = JSON.parse(await readFile("news.json", "utf8").catch(() => '{"editions":[]}'));
const older = data.editions.filter((e) => e.date !== today);
const seen = new Set(older.flatMap((e) => e.items.map((i) => i.url)));
const cutoff = Date.now() - MAX_AGE_HOURS * 3600e3;

const perFeed = await Promise.all(FEEDS.map(load));
const picked = [];
for (const items of perFeed) {
  const fresh = items
    .filter((i) => i.date.getTime() >= cutoff && !seen.has(i.url))
    .filter((i) => !i.categories.some((c) => SKIP_CATEGORIES.includes(c.toLowerCase())))
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_PER_FEED);
  picked.push(...fresh);
}

// Deutsche Meldungen zuerst, dann die neuesten.
picked.sort((a, b) => (a.lang === b.lang ? b.date - a.date : a.lang === "de" ? -1 : 1));
const items = picked.slice(0, MAX_ITEMS).map((i) => ({
  category: topicOf(i),
  title: i.title,
  summary: i.summary,
  source: i.source,
  url: i.url,
  lang: i.lang,
  published: i.date.toISOString(),
}));

if (items.length === 0) {
  console.log("Keine neuen Meldungen gefunden, news.json bleibt unverändert.");
} else {
  data.editions = [{ date: today, items }, ...older].slice(0, KEEP_EDITIONS);
  data.updated = today;
  await writeFile("news.json", JSON.stringify(data, null, 2) + "\n");
  console.log(`Ausgabe ${today}: ${items.length} Meldungen.`);
}
