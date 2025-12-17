import path from "path";
import protoLoader from "@grpc/proto-loader";
import grpc from "@grpc/grpc-js";
import { NextResponse } from "next/server";

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
  console.log(`[API] Connecting to ${grpcAddr}`);
  return new proto.Cats(grpcAddr, grpc.credentials.createInsecure());
}

function listCats() {
  return new Promise((resolve, reject) => {
    const client = getClient();
    client.ListCats({}, (err, response) => {
      if (err) {
        console.error("[API] ListCats error:", err.message);
        return reject(err);
      }
      console.log("[API] ListCats success:", response.total, "cats");
      resolve(response);
    });
  });
}

export async function GET() {
  try {
    console.log("[API] GET /api/cats");
    const response = await listCats();
    return NextResponse.json(response);
  } catch (err) {
    console.error("[API] Error:", err.message);
    return new NextResponse(
      JSON.stringify({ error: err?.message || String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
