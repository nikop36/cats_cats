// server/sources.js
const { fetchFromRescueMeCats } = require("./scrapers/rescuemeScraper");

module.exports = {
  fetchFromRescueMeCats,
};

console.log("[server/sources] loaded, exports:", Object.keys(module.exports));
