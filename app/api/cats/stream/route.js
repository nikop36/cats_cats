import path from "path";
import protoLoader from "@grpc/proto-loader";
import grpc from "@grpc/grpc-js";

const PROTO_PATH = path.join(process.cwd(), "proto", "cats.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).cats;

function getClient() {
  const grpcAddr = process.env.GRPC_SERVER_ADDR || "localhost:50051";
  return new proto.Cats(grpcAddr, grpc.credentials.createInsecure());
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const streamType = searchParams.get("type") || "feed";
  const breed = searchParams.get("breed") || "";

  console.log(`[Stream] Starting: type=${streamType}, breed=${breed}`);

  const encoder = new TextEncoder();
  let messagesSent = 0;
  let isClosed = false;

  const readableStream = new ReadableStream({
    async start(controller) {
      const client = getClient();
      let grpcStream;

      try {
        console.log(`[Stream] Creating ${streamType} stream`);

        switch (streamType) {
          case "breed":
            if (!breed) throw new Error("Breed parameter required");
            console.log(`[Stream] StreamCatsByBreed(${breed})`);
            grpcStream = client.StreamCatsByBreed({ breed: breed.trim() });
            break;

          case "new":
            console.log(`[Stream] StreamNewCats()`);
            grpcStream = client.StreamNewCats({});
            break;

          default:
            console.log(`[Stream] StreamCatFeed()`);
            grpcStream = client.StreamCatFeed({});
        }

        controller.enqueue(encoder.encode(": Stream connected\n\n"));

        grpcStream.on("data", (data) => {
          if (isClosed) return;

          try {
            messagesSent++;
            const json = JSON.stringify(data);
            console.log(`[Stream] Message ${messagesSent}`);
            controller.enqueue(encoder.encode(`data: ${json}\n\n`));
          } catch (err) {
            console.error(`[Stream] Data error:`, err.message);
          }
        });

        grpcStream.on("error", (err) => {
          if (isClosed) return;

          console.error(`[Stream] gRPC error:`, err.message);
          isClosed = true;

          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: err.message })}\n\n`
              )
            );
            controller.close();
          } catch (e) {
            console.error(`[Stream] Error close:`, e.message);
          }
        });

        grpcStream.on("end", () => {
          if (isClosed) return;

          console.log(`[Stream] Ended (${messagesSent} msgs)`);
          isClosed = true;

          try {
            controller.close();
          } catch (e) {
            console.error(`[Stream] Error closing controller:`, e.message);
          }
        });

        // Handle client disconnect
        request.signal?.addEventListener("abort", () => {
          if (isClosed) return;

          console.log(`[Stream] Client disconnected`);
          isClosed = true;

          try {
            grpcStream?.cancel?.();
            controller.close();
          } catch (e) {
            console.error(`[Stream] Error on abort:`, e.message);
          }
        });
      } catch (err) {
        console.error(`[Stream] Setup error:`, err.message);
        isClosed = true;

        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err.message })}\n\n`
            )
          );
          controller.close();
        } catch (e) {
          console.error(`[Stream] Error closing on setup error:`, e.message);
        }
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
