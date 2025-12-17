const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_USER_AGENT =
  process.env.SCRAPER_USER_AGENT ||
  "cats-cats-scraper/1.0 (+mailto:you@example.com)";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extract all cat listings from a location page
 * Each listing is in a div. card._cl._fa._fm
 */
function extractCatsFromLocationPage(html) {
  if (!html) return [];

  const $ = cheerio.load(html);
  const cats = [];

  // Each listing container
  $("div.card._cl._fa._fm").each((idx, element) => {
    const $container = $(element);

    const breed = $container.find("span._sbbr").first().text().trim();
    if (!breed) return;

    const rid = $container.find("span._rid").first().text().trim();
    const aid = $container.find("span._aid").first().text().trim();
    const catId = rid || aid || `cat-${Date.now()}-${idx}`;

    const name = $container.find("span._cpn").first().text().trim();

    let imageUrl = "";
    const $img = $container.find("img._pp").first();
    if ($img && $img.length > 0) {
      imageUrl = $img.attr("data-original") || $img.attr("src") || "";
    }

    if (
      !imageUrl ||
      /loader|placeholder|loading|spinner|\. svg/i.test(imageUrl)
    ) {
      return;
    }

    const location = $container.find("span._clo").first().text().trim();

    let info = "";
    const $p = $container.find("p").first();
    if ($p && $p.length > 0) {
      info = $p.text().trim();
      info = info.replace(/»\s*Read more\s*»/g, "").trim();
      info = info.slice(0, 300);
    }

    if (!info && name && location) {
      info = `${name} - ${location}`;
    }

    cats.push({
      id: `rescueme-${catId}`,
      source: "rescueme",
      url: imageUrl,
      breed: breed,
      info: info || `${name || "Cat"} - ${location || ""}`,
      fetched_at: Date.now(),
    });
  });

  return cats;
}

/**
 * Main fetch function for cat. rescueme.org
 * Now returns ALL cats from states, not limited
 */
async function fetchFromRescueMeCats(limit = 8, catsPerState = 5) {
  const results = [];

  const states = [
    "florida",
    "california",
    "texas",
    "newyork",
    "pennsylvania",
    "illinois",
    "ohio",
    "georgia",
  ];

  // Don't shuffle - go through all states
  for (const state of states) {
    const stateUrl = `https://cat.rescueme.org/${state}`;

    try {
      await delay(500 + Math.floor(Math.random() * 500));

      console.log(`  Fetching ${state}...`);

      const response = await axios.get(stateUrl, {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: "text/html",
          Referer: "https://cat. rescueme.org/",
        },
        timeout: 15000,
      });

      if (!response.data) {
        console.log(`    No HTML returned for ${state}`);
        continue;
      }

      // Extract ALL cats from the HTML
      const stateCats = extractCatsFromLocationPage(response.data);
      console.log(`    Found ${stateCats.length} cats`);

      // Add up to catsPerState from this state
      const stateCatsLimited = stateCats.slice(0, catsPerState);

      for (const cat of stateCatsLimited) {
        if (results.length >= limit) break; // Stop only when we hit the limit

        const exists = results.find(
          (r) => r.id === cat.id || r.url === cat.url
        );
        if (exists) continue;

        results.push(cat);
      }
    } catch (e) {
      console.error(`  Error fetching ${state}:`, e.message);
      continue;
    }
  }

  // Return up to 'limit' cats, but could be less if not enough unique ones
  return results.slice(0, limit);
}

module.exports = { fetchFromRescueMeCats };
