const { fetchFromRescueMeCats } = require("./rescuemeScraper");

(async () => {
  try {
    console.log("Fetching RescueMe cats...\n");
    const cats = await fetchFromRescueMeCats(8, 5, false); // limit=8, catsPerState=5, validateImages=false
    console.log(`Found ${cats.length} cats:\n`);
    cats.forEach((cat, i) => {
      console.log(`#${i + 1}:`);
      console.log(`  ID: ${cat.id}`);
      console.log(`  Breed: ${cat.breed}`);
      console.log(`  Image URL: ${cat.url}`);
      console.log(`  Info: ${cat.info.slice(0, 100)}...`);
      console.log();
    });
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
