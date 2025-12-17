import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LLMRequest = {
  date?: string;
  location?: string;
  count?: number;
  breed?: string;
  context?: string;
  timezone?: string;
  userAgent?: string;
};

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
  }
  throw new Error("Unable to parse JSON from model output");
}

function mockResponse(date: string, location: string, count: number) {
  const catActivities = [
    {
      title: `Visit Cat Cafe in ${location}`,
      description: "Enjoy coffee while playing with adoptable cats.",
      time: "10:00 AM",
      tags: ["indoor", "cats", "social"],
    },
    {
      title: `Pet Store Tour`,
      description:
        "Browse cat supplies and meet furry friends at local pet stores.",
      time: "2:00 PM",
      tags: ["indoor", "shopping", "cats"],
    },
    {
      title: `Cat Photography Walk`,
      description: "Explore neighborhoods known for friendly outdoor cats.",
      time: "4:00 PM",
      tags: ["outdoor", "photography", "cats"],
    },
    {
      title: `Cat Grooming Workshop`,
      description: "Learn professional grooming techniques for your feline.",
      time: "11:00 AM",
      tags: ["educational", "indoor", "cats"],
    },
    {
      title: `Visit Animal Shelter`,
      description: "Volunteer or adopt at the local cat shelter.",
      time: "1:00 PM",
      tags: ["indoor", "volunteer", "cats", "family"],
    },
    {
      title: `Cat-themed Movie Night`,
      description: "Watch classic cat movies at home or cinema.",
      time: "7:00 PM",
      tags: ["indoor", "entertainment", "cats"],
    },
    {
      title: `DIY Cat Toy Making`,
      description: "Create homemade toys for your cats using household items.",
      time: "3:00 PM",
      tags: ["indoor", "creative", "cats", "diy"],
    },
  ];

  const suggestions = Array.from({ length: count }).map(
    (_, i) => catActivities[i % catActivities.length]
  );

  return {
    suggestions,
    meta: {
      generated_for: { date, location, count },
      source: "mock",
      generated_at: Date.now(),
    },
  };
}

export async function POST(request: Request) {
  try {
    const body: LLMRequest = await request
      .json()
      .catch(() => ({} as LLMRequest));
    console.log("[LLM] incoming body:", body);

    const date = body.date || new Date().toLocaleDateString();
    const location = body.location || "your area";
    const count = Math.max(1, Math.min(10, Number(body.count || 3)));
    const breed = body.breed?.trim();
    const context = body.context ? `Additional context: ${body.context}\n` : "";
    const timezone = body.timezone || "UTC";
    const userAgent = body.userAgent || "";

    // Determine if mobile
    const isMobile = userAgent.toLowerCase().includes("mobile");

    // Simulate weather based on date
    const requestDate = new Date(date);
    const month = requestDate.getMonth();
    const season =
      month >= 2 && month <= 4
        ? "spring"
        : month >= 5 && month <= 7
        ? "summer"
        : month >= 8 && month <= 10
        ? "autumn"
        : "winter";
    const weatherHint =
      season === "summer"
        ? "warm and sunny"
        : season === "winter"
        ? "cold, possibly snowing"
        : season === "autumn"
        ? "cool with occasional rain"
        : "mild with blooming flowers";

    const dayOfWeek = requestDate.toLocaleDateString("en-US", {
      weekday: "long",
    });
    const deviceContext = isMobile
      ? "User is on mobile device, suggest portable activities."
      : "User is on desktop, can include activities requiring research or planning.";

    const breedContext = breed
      ? `IMPORTANT: The user is interested in the ${breed} cat breed. Include 2-3 fun facts about ${breed} cats in the descriptions of your suggestions. Make the facts interesting and relevant to the activities (e.g., personality traits, physical characteristics, history).`
      : "";

    const prompt = [
      `You are a helpful assistant that returns ONLY valid JSON (no commentary, no markdown).`,
      `Schema: { "suggestions": [ { "title": string, "description": string, "time": string, "tags": string[] } ], "meta": { "generated_for": { "date": string, "location": string, "count": number }, "source": string, "generated_at": number } }`,
      `Task: Propose ${count} interesting cat-related or pet-friendly activities in ${location} for ${dayOfWeek}, ${date}.`,
      `Context: The weather will likely be ${weatherHint} (${season}). ${deviceContext} User timezone: ${timezone}. ${context}`,
      breedContext,
      `Include a mix of: cat cafes, pet stores, outdoor parks suitable for pets, cat-themed events, or activities cat lovers would enjoy.`,
      `Each suggestion should have a realistic time (e.g., "10:00 AM", "2:00 PM") and relevant tags (e.g., "outdoor", "indoor", "family", "cats", "pets").`,
      `Return exactly one top-level JSON object conforming to the schema above.`,
    ].join("\n\n");

    const GROQ_KEY = process.env.GROQ_API_KEY;

    if (GROQ_KEY) {
      try {
        console.log("[LLM] Trying Groq...");
        const groqResp = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_KEY}`,
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [
                {
                  role: "system",
                  content:
                    "You must return only valid JSON and follow the schema precisely. No markdown, no code blocks.",
                },
                { role: "user", content: prompt },
              ],
              max_tokens: 1000,
              temperature: 0.3,
            }),
          }
        );

        if (groqResp.ok) {
          const groqJson = await groqResp.json();
          const content = String(
            groqJson?.choices?.[0]?.message?.content || ""
          );
          try {
            const parsed = extractJson(content);
            parsed.meta = parsed.meta || {
              generated_for: { date, location, count },
              source: "groq",
              model: "llama3-8b-8192",
              generated_at: Date.now(),
            };
            console.log("[LLM] Groq success");
            return NextResponse.json({ ...parsed, _raw: content });
          } catch (e) {
            console.error("[LLM][Groq] JSON parse failed:", e);
          }
        } else {
          console.warn(
            "[LLM][Groq] API error:",
            groqResp.status,
            await groqResp.text().catch(() => "")
          );
        }
      } catch (e: any) {
        console.error("[LLM][Groq] unexpected:", e?.message);
      }
    }

    console.warn(
      "[LLM] No provider available or all providers failed — returning mock response."
    );
    return NextResponse.json(mockResponse(date, location, count), {
      status: 200,
    });
  } catch (err: any) {
    console.error("[LLM] unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
