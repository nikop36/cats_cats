const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const readline = require("readline");

const PROTO_PATH = path.join(__dirname, "..", "proto", "cats.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).cats;

const client = new proto.Cats(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// ============ SERVICE 1: ListCats (Unary RPC) ============
async function testListCats() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 1: ListCats (Unary RPC)");
  console.log("=".repeat(60));
  console.log("Description: Fetch all cats from database (one-shot)");

  return new Promise((resolve) => {
    console.log("\n📤 Calling: client.ListCats({})");

    client.ListCats({}, (err, response) => {
      if (err) {
        console.error("❌ Error:", err.message);
        resolve(false);
        return;
      }

      console.log("\n✅ Response received! ");
      console.log(`   Total cats: ${response.total}`);
      console.log(`   Cats in response: ${response.cats.length}`);

      if (response.cats.length > 0) {
        console.log("\n📋 First 3 cats:");
        response.cats.slice(0, 3).forEach((cat, idx) => {
          console.log(`   ${idx + 1}. [${cat.id}] ${cat.breed}`);
          console.log(`      Info: ${cat.info.substring(0, 60)}...`);
          console.log(
            `      Fetched: ${new Date(
              Number(cat.fetched_at)
            ).toLocaleString()}`
          );
        });
      }

      resolve(true);
    });
  });
}

// ============ SERVICE 2: StreamCatFeed (Server-side Streaming) ============
async function testStreamCatFeed() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 2: StreamCatFeed (Server-side Streaming)");
  console.log("=".repeat(60));
  console.log("Description: Stream ALL cats in real-time");
  console.log("Duration: 15 seconds (will auto-stop)\n");

  return new Promise((resolve) => {
    console.log("📤 Calling: client. StreamCatFeed({})");

    let count = 0;
    const stream = client.StreamCatFeed({});
    const timeout = setTimeout(() => {
      console.log("\n⏱️  Time limit reached (15s)");
      stream.cancel();
      resolve(count > 0);
    }, 15000);

    stream.on("data", (cat) => {
      count++;
      if (count <= 5) {
        console.log(`   [${count}] 🐱 ${cat.breed}`);
      } else if (count === 6) {
        console.log(`   ...  (receiving more cats)`);
      }
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      console.error("\n❌ Stream error:", err.message);
      resolve(false);
    });

    stream.on("end", () => {
      clearTimeout(timeout);
      console.log(`\n✅ Stream ended! `);
      console.log(`   Total cats received: ${count}`);
      resolve(count > 0);
    });
  });
}

// ============ SERVICE 3: StreamCatsByBreed (Server-side Streaming) ============
async function testStreamCatsByBreed() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 3: StreamCatsByBreed (Server-side Streaming)");
  console.log("=".repeat(60));
  console.log("Description: Stream cats filtered by breed\n");

  const breed = await prompt(
    'Enter breed to filter (e.g., "Tabby", "Siamese", "Maine"): '
  );

  if (!breed.trim()) {
    console.log("❌ Breed required");
    return false;
  }

  return new Promise((resolve) => {
    console.log(
      `\n📤 Calling: client.StreamCatsByBreed({ breed: "${breed}" })`
    );

    let count = 0;
    const stream = client.StreamCatsByBreed({ breed });

    stream.on("data", (cat) => {
      count++;
      if (count <= 10) {
        console.log(`   [${count}] 🐱 ${cat.breed}`);
      } else if (count === 11) {
        console.log(`   ... (receiving more cats)`);
      }
    });

    stream.on("error", (err) => {
      console.error("\n❌ Stream error:", err.message);
      resolve(false);
    });

    stream.on("end", () => {
      console.log(`\n✅ Stream ended!`);
      console.log(`   Total ${breed} cats found: ${count}`);
      resolve(count > 0);
    });
  });
}

// ============ SERVICE 4: StreamNewCats (Server-side Streaming) ============
async function testStreamNewCats() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 4: StreamNewCats (Server-side Streaming)");
  console.log("=".repeat(60));
  console.log("Description: Stream ONLY new cats as they arrive");
  console.log("Duration: 30 seconds (will wait for new cats)\n");

  return new Promise((resolve) => {
    console.log("📤 Calling: client. StreamNewCats({})");
    console.log(
      "⏳ Waiting for new cats to arrive...  (gRPC server polls every 10s)\n"
    );

    let count = 0;
    const stream = client.StreamNewCats({});
    const timeout = setTimeout(() => {
      console.log("\n⏱️  Time limit reached (30s)");
      stream.cancel();
      resolve(count > 0);
    }, 30000);

    stream.on("data", (msg) => {
      count++;
      const cat = msg.cat || msg;
      console.log(`   [${count}] ✨ NEW: ${cat.breed}`);
      console.log(`       Info: ${cat.info.substring(0, 50)}...`);
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      console.error("\n❌ Stream error:", err.message);
      resolve(false);
    });

    stream.on("end", () => {
      clearTimeout(timeout);
      console.log(`\n✅ Stream ended!`);
      console.log(`   Total new cats received: ${count}`);
      resolve(count >= 0); // Success even if no new cats
    });
  });
}

// ============ SERVICE 5: CatChat (Bidirectional Streaming) ============
async function testCatChat() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 5: CatChat (Bidirectional Streaming)");
  console.log("=".repeat(60));
  console.log("Description: Chat about cats in real-time");
  console.log('Instructions: Type messages (or "quit" to exit)\n');

  return new Promise((resolve) => {
    console.log("📤 Calling: client.CatChat()");

    const stream = client.CatChat();
    let messageCount = 0;

    stream.on("data", (message) => {
      messageCount++;
      const time = new Date(Number(message.ts)).toLocaleTimeString();
      console.log(`[${time}] ${message.from}: ${message.text}`);
    });

    stream.on("error", (err) => {
      console.error("\n❌ Stream error:", err.message);
      rl.close();
      resolve(false);
    });

    stream.on("end", () => {
      console.log("\n✅ Chat ended!");
      console.log(`   Total messages received: ${messageCount}`);
      resolve(true);
    });

    const askMessage = () => {
      rl.question("You: ", (text) => {
        if (text.toLowerCase() === "quit") {
          stream.end();
          resolve(true);
          return;
        }

        stream.write({
          from: "CLI User",
          text: text,
          ts: Date.now(),
        });

        askMessage();
      });
    };

    askMessage();
  });
}

// ============ Main Menu ============
async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("█" + " ".repeat(58) + "█");
  console.log("█" + "  🐱 gRPC CAT SERVICES TEST CLIENT 🐱".padEnd(59) + "█");
  console.log("█" + " ".repeat(58) + "█");
  console.log("█".repeat(60));

  console.log("\nConnecting to gRPC server at localhost:50051...\n");

  const results = {};

  while (true) {
    console.log("\n" + "=".repeat(60));
    console.log("MAIN MENU");
    console.log("=".repeat(60));
    console.log("1️⃣  Test ListCats (Unary RPC)");
    console.log("2️⃣  Test StreamCatFeed (Server Streaming)");
    console.log("3️⃣  Test StreamCatsByBreed (Server Streaming + Filter)");
    console.log("4️⃣  Test StreamNewCats (Server Streaming)");
    console.log("5️⃣  Test CatChat (Bidirectional Streaming)");
    console.log("6️⃣  Run ALL tests");
    console.log("0️⃣  Exit");
    console.log("=".repeat(60));

    const choice = await prompt("\nChoose a test (0-6): ");

    switch (choice) {
      case "1":
        results["ListCats"] = await testListCats();
        break;
      case "2":
        results["StreamCatFeed"] = await testStreamCatFeed();
        break;
      case "3":
        results["StreamCatsByBreed"] = await testStreamCatsByBreed();
        break;
      case "4":
        results["StreamNewCats"] = await testStreamNewCats();
        break;
      case "5":
        results["CatChat"] = await testCatChat();
        break;
      case "6":
        console.log("\n🚀 Running ALL tests...\n");
        results["ListCats"] = await testListCats();
        results["StreamCatFeed"] = await testStreamCatFeed();
        results["StreamCatsByBreed"] = await testStreamCatsByBreed();
        results["StreamNewCats"] = await testStreamNewCats();
        results["CatChat"] = await testCatChat();

        console.log("\n" + "=".repeat(60));
        console.log("📊 TEST RESULTS SUMMARY");
        console.log("=".repeat(60));
        Object.entries(results).forEach(([name, passed]) => {
          const icon = passed ? "✅" : "❌";
          console.log(`${icon} ${name}`);
        });
        const allPassed = Object.values(results).every((r) => r);
        console.log("=".repeat(60));
        if (allPassed) {
          console.log("🎉 ALL TESTS PASSED!\n");
        } else {
          console.log("⚠️  Some tests failed\n");
        }
        break;
      case "0":
        console.log("\n👋 Goodbye!\n");
        rl.close();
        process.exit(0);
      default:
        console.log("Invalid choice");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
