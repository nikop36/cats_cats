const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { randomUUID } = require("crypto");

const { fetchFromRescueMeCats } = require("./sources");

const PROTO_PATH = path.join(__dirname, "..", "proto", "cats.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).cats;

const cats = [];
const streamClients = [];
const newCatSubscribers = [];
const breedStreamClients = new Map();
const chatClients = [];

function ListCats(call, callback) {
  callback(null, { cats, total: cats.length });
}

function GetCat(call, callback) {
  const id = call.request.id;
  const found = cats.find((c) => c.id === id);
  if (!found)
    return callback({ code: grpc.status.NOT_FOUND, message: "Cat not found" });
  callback(null, { cat: found });
}

function AddSource(call, callback) {
  const { name, url, type } = call.request;
  if (!name || !type)
    return callback(null, { ok: false, message: "name & type required" });
  callback(null, { ok: true, message: `Source ${name} added` });
}

function StreamCatFeed(call) {
  streamClients.push(call);
  cats.forEach((c) => call.write(c));

  const cleanup = () => {
    const i = streamClients.indexOf(call);
    if (i !== -1) streamClients.splice(i, 1);
  };

  call.on("cancelled", cleanup);
  call.on("end", cleanup);
  call.on("error", cleanup);
}

function StreamCatsByBreed(call) {
  const breedFilter = (call.request.breed || "").toLowerCase().trim();

  console.log(`[gRPC] StreamCatsByBreed called with breed: "${breedFilter}"`);

  if (!breedFilter) {
    call.destroy(new Error("Breed parameter required"));
    return;
  }

  const matchingCats = cats.filter((c) =>
    c.breed.toLowerCase().includes(breedFilter)
  );

  console.log(
    `[gRPC] Found ${matchingCats.length} matching cats for breed "${breedFilter}"`
  );
  matchingCats.forEach((c) => {
    try {
      call.write(c);
    } catch (e) {
      console.error(`[gRPC] Error writing cat:`, e.message);
    }
  });

  if (!breedStreamClients.has(breedFilter)) {
    breedStreamClients.set(breedFilter, []);
  }
  breedStreamClients.get(breedFilter).push(call);
  console.log(`[gRPC] Added client for breed "${breedFilter}"`);

  const cleanup = () => {
    console.log(`[gRPC] Cleanup for breed "${breedFilter}"`);
    const clients = breedStreamClients.get(breedFilter);
    if (clients) {
      const i = clients.indexOf(call);
      if (i !== -1) clients.splice(i, 1);
      if (clients.length === 0) {
        breedStreamClients.delete(breedFilter);
      }
    }
  };

  call.on("cancelled", cleanup);
  call.on("end", cleanup);
  call.on("error", cleanup);
}

function StreamNewCats(call) {
  newCatSubscribers.push(call);

  const cleanup = () => {
    const i = newCatSubscribers.indexOf(call);
    if (i !== -1) newCatSubscribers.splice(i, 1);
  };

  call.on("cancelled", cleanup);
  call.on("end", cleanup);
  call.on("error", cleanup);
}

function broadcastNewCat(cat) {
  // Broadcast to StreamCatFeed clients
  for (const client of streamClients) {
    try {
      client.write(cat);
    } catch (e) {}
  }

  // Broadcast to StreamNewCats clients
  for (const client of newCatSubscribers) {
    try {
      client.write({ cat: cat, event: "added" });
    } catch (e) {}
  }

  // Broadcast to breed-specific clients
  const breed = (cat.breed || "").toLowerCase();
  for (const [breedFilter, clients] of breedStreamClients) {
    if (breed.includes(breedFilter)) {
      for (const client of clients) {
        try {
          client.write(cat);
        } catch (e) {
          console.error(`[gRPC] Error writing to breed client:`, e.message);
        }
      }
    }
  }
}

function CatChat(call) {
  chatClients.push(call);

  call.on("data", (msg) => {
    const toSend = {
      from: msg.from || "anonymous",
      text: msg.text || "",
      ts: Date.now(),
    };

    for (const c of chatClients) {
      try {
        c.write(toSend);
      } catch (e) {}
    }
  });

  call.on("end", () => {
    const idx = chatClients.indexOf(call);
    if (idx !== -1) chatClients.splice(idx, 1);
    call.end();
  });

  call.on("error", () => {
    const idx = chatClients.indexOf(call);
    if (idx !== -1) chatClients.splice(idx, 1);
  });
}

function keepIfHasBreedAndUrl(item) {
  if (!item) return false;
  const hasBreed = item.breed && String(item.breed).trim().length > 0;
  const hasUrl = item.url && String(item.url).trim().length > 0;
  return hasBreed && hasUrl;
}

function isCatDuplicate(newCat, existingCats) {
  return existingCats.some((existing) => {
    if (newCat.url && existing.url && newCat.url === existing.url) {
      return true;
    }

    if (
      newCat.breed &&
      existing.breed &&
      newCat.breed.toLowerCase() === existing.breed.toLowerCase() &&
      newCat.info &&
      existing.info &&
      newCat.info.toLowerCase() === existing.info.toLowerCase()
    ) {
      return true;
    }

    return false;
  });
}

async function seedInitialCats() {
  try {
    console.log("🐱 Seeding initial cats from RescueMe...\n");

    const rmCats = await fetchFromRescueMeCats(30, 10).catch((e) => {
      console.warn("  RescueMe failed:", e.message);
      return [];
    });

    const all = rmCats.filter(keepIfHasBreedAndUrl);

    for (const c of all) {
      cats.push({ ...c, id: c.id || randomUUID() });
    }
    console.log(`\n✓ Seeded ${cats.length} unique cats\n`);
  } catch (e) {
    console.warn("Seeding failed:", e && e.message ? e.message : e);
  }
}

async function continuouslyFetchCats() {
  console.log("🔄 Starting continuous cat streaming every 10 seconds...\n");

  let fetchedPool = []; // Keep a pool of fetched but not yet added cats

  setInterval(async () => {
    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ⏱️  Polling for new cats...`);

      // If pool is empty, fetch a new batch
      if (fetchedPool.length === 0) {
        console.log(`   📥 Pool empty, fetching 100 fresh cats from API...`);
        const rmCats = await fetchFromRescueMeCats(100, 30).catch(() => []);
        const filtered = rmCats.filter(keepIfHasBreedAndUrl);
        console.log(`   🔍 Filtered to ${filtered.length} valid cats`);

        // Add to pool
        for (const cat of filtered) {
          if (!isCatDuplicate(cat, cats)) {
            fetchedPool.push(cat);
          }
        }
        console.log(`   ✅ Pool now has ${fetchedPool.length} new unique cats`);
      }

      // Add exactly 2 cats from the pool (or fewer if pool is smaller)
      let addedCount = 0;
      const toAdd = Math.min(2, fetchedPool.length);

      for (let i = 0; i < toAdd; i++) {
        const cat = fetchedPool.shift();
        const newCat = {
          ...cat,
          id: cat.id || randomUUID(),
          fetched_at: Date.now(),
        };
        cats.push(newCat);
        addedCount++;

        console.log(` ✨ Added cat #${addedCount}: ${newCat.breed}`);

        // Broadcast to all streaming clients
        broadcastNewCat(newCat);
      }

      console.log(
        `   📊 Added ${addedCount} cats | DB size: ${cats.length} | Pool size: ${fetchedPool.length}\n`
      );
    } catch (e) {
      console.error("Polling error:", e && e.message ? e.message : e);
    }
  }, 10_000); // Every 10 seconds
}

function getServer() {
  const server = new grpc.Server();
  server.addService(proto.Cats.service, {
    ListCats,
    GetCat,
    AddSource,
    StreamCatFeed,
    StreamCatsByBreed,
    StreamNewCats,
    CatChat,
  });
  return server;
}

async function start() {
  await seedInitialCats();
  continuouslyFetchCats();

  const server = getServer();
  const addr = "0.0.0.0:50051";
  server.bindAsync(
    addr,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error("gRPC bind error:", err);
        return;
      }
      console.log(`\n🚀 gRPC server listening on ${addr}`);
      console.log(`📡 Streaming services ready:\n`);
      console.log(`   1️⃣  StreamCatFeed - Server streaming all cats`);
      console.log(
        `   2️⃣  StreamCatsByBreed - Server streaming filtered by breed`
      );
      console.log(`   3️⃣  StreamNewCats - Server streaming only NEW cats`);
      console.log(`   4️⃣  CatChat - Bidirectional streaming chat\n`);
      server.start();
    }
  );
}

start().catch((err) => {
  console.error("Server start failed:", err);
});
