"use client";

import React, { useEffect, useState, useRef } from "react";
import ActivitySuggestion from "./llm/ActivitySuggestion";

type Cat = {
  id: string;
  source?: string;
  url?: string;
  breed?: string;
  info?: string;
  fetched_at?: string | number;
};

export default function Home() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamType, setStreamType] = useState<"feed" | "new" | "breed">(
    "feed"
  );
  const [breedFilter, setBreedFilter] = useState("");
  const [streamStatus, setStreamStatus] = useState<string>("");
  const [messageCount, setMessageCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageCountRef = useRef(0);

  // Fetch initial cats
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetch("/api/cats")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setCats(Array.isArray(data.cats) ? data.cats : []);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("[Frontend] Initial fetch error:", err);
        setError(err.message || "Failed to fetch");
        setCats([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Handle streaming
  useEffect(() => {
    // If breed stream is selected but no breed entered, don't start streaming
    if (streaming && streamType === "breed" && !breedFilter.trim()) {
      console.log("[Frontend] Breed filter empty, not starting stream");
      setStreamStatus("⏳ Enter a breed name to start streaming");
      return;
    }

    if (!streaming) {
      if (eventSourceRef.current) {
        console.log("[Frontend] Closing stream");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setStreamStatus("");
      messageCountRef.current = 0;
      setMessageCount(0);
      return;
    }

    let mounted = true;

    // Build URL
    const url = new URL("/api/cats/stream", window.location.origin);
    url.searchParams.set("type", streamType);

    if (streamType === "breed") {
      url.searchParams.set("breed", breedFilter.trim());
    }

    const streamUrl = url.toString();
    console.log(`[Frontend] Opening stream: ${streamUrl}`);
    setStreamStatus(`🔄 Connecting to ${streamType}... `);
    messageCountRef.current = 0;
    setMessageCount(0);

    try {
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.addEventListener("message", (event) => {
        if (!mounted) return;

        try {
          const data = JSON.parse(event.data);
          console.log(`[Frontend] Received:`, data);

          if (data.error) {
            console.error("[Frontend] Server error:", data.error);
            setError(`Stream error: ${data.error}`);
            setStreaming(false);
            return;
          }

          // Extract cat from message
          const cat: Cat = data.cat || data;

          if (!cat.id) {
            console.warn("[Frontend] Invalid cat data:", data);
            return;
          }

          console.log(`[Frontend] Got cat: ${cat.breed}`);

          setCats((prevCats) => {
            const exists = prevCats.some((c) => c.id === cat.id);
            if (exists) {
              console.log(`[Frontend] Cat already exists: ${cat.id}`);
              return prevCats;
            }
            return [cat, ...prevCats];
          });

          messageCountRef.current++;
          setMessageCount(messageCountRef.current);
          setStreamStatus(
            `✅ Streaming ${streamType}${
              streamType === "breed" ? ` (${breedFilter})` : ""
            } - ${messageCountRef.current} messages`
          );
        } catch (err) {
          console.error(
            "[Frontend] Parse error:",
            err,
            "Raw data:",
            event.data
          );
        }
      });

      es.onerror = (event) => {
        console.error(
          "[Frontend] EventSource onerror.  ReadyState:",
          es.readyState,
          "Event:",
          event
        );

        if (mounted) {
          // ReadyState: 0=connecting, 1=open, 2=closed
          if (es.readyState === EventSource.CLOSED) {
            console.log("[Frontend] Stream closed by server");
            setStreamStatus("⏹️ Stream closed (server ended)");
          } else {
            console.error("[Frontend] Stream connection lost");
            setError(`Stream connection lost (readyState: ${es.readyState})`);
            setStreaming(false);
          }
        }
        es.close();
      };

      console.log("[Frontend] Stream opened successfully");
    } catch (err) {
      console.error("[Frontend] Stream setup error:", err);
      if (mounted) {
        setError(`Stream error: ${String(err)}`);
        setStreaming(false);
      }
    }

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        console.log("[Frontend] Cleanup: closing stream");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [streaming, streamType, breedFilter]);

  // LLM form state
  const [llmDate, setLlmDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [llmLocation, setLlmLocation] = useState("");
  const [llmCount, setLlmCount] = useState<number>(3);
  const [llmBreed, setLlmBreed] = useState("");
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callLLM() {
    setError(null);
    setLlmLoading(true);
    setSuggestions([]);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const userAgent = navigator.userAgent;

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: llmDate,
          location: llmLocation || "Unknown location",
          count: llmCount,
          breed: llmBreed.trim() || undefined,
          timezone,
          userAgent,
        }),
      });

      if (!res.ok) {
        let errBody: any;
        try {
          errBody = await res.json();
        } catch {
          try {
            errBody = await res.text();
          } catch {
            errBody = `HTTP ${res.status} ${res.statusText}`;
          }
        }
        const msg =
          errBody && typeof errBody === "object"
            ? errBody.error || errBody.message || JSON.stringify(errBody)
            : String(errBody);
        console.warn("[LLM] server error:", res.status, msg);
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.debug("[LLM] response", data);

      const rawSuggestions = Array.isArray(data.suggestions)
        ? data.suggestions
        : [];
      const parsed = rawSuggestions.map((s: any) =>
        ActivitySuggestion.fromJSON(s)
      );
      setSuggestions(parsed);
    } catch (e: any) {
      console.error("[LLM] Error:", e);
      setError(e?.message || "LLM request failed");
    } finally {
      setLlmLoading(false);
    }
  }

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>🐱 Cat Feed with gRPC Streaming</h1>
      <div
        style={{
          marginBottom: "20px",
          padding: "15px",
          backgroundColor: "gray",
          borderRadius: "8px",
        }}
      >
        <div style={{ marginBottom: "10px" }}>
          <label>
            <input
              type="checkbox"
              checked={streaming}
              onChange={(e) => {
                setStreaming(e.target.checked);
                if (!e.target.checked) {
                  setStreamType("feed");
                  setBreedFilter("");
                }
              }}
            />
            {" Enable Real-time Streaming"}
          </label>
        </div>

        {streaming && (
          <>
            <div style={{ marginBottom: "10px" }}>
              <label>Stream Type: </label>
              <select
                value={streamType}
                onChange={(e) => {
                  setStreamType(e.target.value as "feed" | "new" | "breed");
                  if (e.target.value !== "breed") {
                    setBreedFilter("");
                  }
                }}
              >
                <option value="feed">📡 StreamCatFeed (All)</option>
                <option value="new">🆕 StreamNewCats (New Only)</option>
                <option value="breed">🐱 StreamCatsByBreed (Filter)</option>
              </select>
            </div>

            {streamType === "breed" && (
              <div>
                <label>Breed Filter: </label>
                <input
                  type="text"
                  placeholder="e.g., Tabby, Siamese, Maine"
                  value={breedFilter}
                  onChange={(e) => setBreedFilter(e.target.value)}
                  style={{ padding: "5px", marginLeft: "10px" }}
                  autoFocus
                />
                {breedFilter && (
                  <small style={{ marginLeft: "10px", color: "#666" }}>
                    ✅ Filter active: "{breedFilter}"
                  </small>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Status */}
      {loading && <div>⏳ Loading...</div>}
      {streamStatus && (
        <div
          style={{
            color: streamStatus.includes("⏳")
              ? "orange"
              : streamStatus.includes("❌")
              ? "red"
              : "green",
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "gray",
            borderRadius: "4px",
          }}
        >
          {streamStatus}
        </div>
      )}
      {error && (
        <div
          style={{
            color: "red",
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "gray",
            borderRadius: "4px",
          }}
        >
          ❌ {error}
        </div>
      )}

      <section
        style={{
          margin: 16,
          padding: 12,
          background: "gray",
          borderRadius: 8,
        }}
      >
        <h3>🤖 Dynamic LLM Activity Suggestions</h3>
        <p style={{ fontSize: 12, color: "#ccc", marginBottom: 12 }}>
          Get personalized cat-related activity suggestions based on your
          location, date, and device context. Optionally specify a cat breed to
          get fun facts included!
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <label>
            Date:
            <input
              type="date"
              value={llmDate}
              onChange={(e) => setLlmDate(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <label>
            Location:
            <input
              type="text"
              value={llmLocation}
              onChange={(e) => setLlmLocation(e.target.value)}
              placeholder="e.g., Ljubljana, New York"
              style={{ marginLeft: 8, minWidth: 180 }}
            />
          </label>
          <label>
            Cat Breed (optional):
            <input
              type="text"
              value={llmBreed}
              onChange={(e) => setLlmBreed(e.target.value)}
              placeholder="e.g., Persian, Siamese"
              style={{ marginLeft: 8, minWidth: 150 }}
            />
          </label>
          <label>
            Count:
            <input
              type="number"
              min={1}
              max={10}
              value={llmCount}
              onChange={(e) => setLlmCount(Number(e.target.value))}
              style={{ width: 64, marginLeft: 8 }}
            />
          </label>
          <button
            onClick={callLLM}
            disabled={llmLoading}
            style={{ marginLeft: 8, cursor: llmLoading ? "wait" : "pointer" }}
          >
            {llmLoading ? "🔄 Generating..." : "✨ Get Suggestions"}
          </button>
        </div>

        {error && (
          <div
            style={{
              color: "crimson",
              marginBottom: 8,
              padding: 8,
              background: "#ffe0e0",
              borderRadius: 4,
            }}
          >
            ❌ Error: {error}
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4>
              📋 Suggestions for {llmLocation || "your area"} on {llmDate}
            </h4>
            <ul style={{ paddingLeft: 20 }}>
              {suggestions.map((s, i) => (
                <li key={i} style={{ marginBottom: 12 }}>
                  <strong style={{ color: "#4a9eff" }}>{s.title}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#999" }}>
                    ⏰ {s.time}
                  </span>
                  <div style={{ marginTop: 4 }}>{s.description}</div>
                  {s.tags.length > 0 && (
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                      🏷️ {s.tags.map((tag) => `#${tag}`).join(" ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Cat Grid */}
      {!loading && cats.length > 0 && (
        <div>
          <h2>
            {cats.length} Cats {streamType === "breed" && `(${breedFilter})`}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: "20px",
            }}
          >
            {cats.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "12px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                {c.url && (
                  <img
                    src={c.url}
                    alt={c.breed}
                    width="100%"
                    style={{
                      height: "200px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      marginBottom: "8px",
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div style={{ fontSize: "14px" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    {c.breed}
                  </div>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "12px",
                      marginBottom: "4px",
                    }}
                  >
                    {c.info}
                  </div>
                  <div style={{ fontSize: "10px", color: "#999" }}>
                    ID: {c.id.substring(0, 20)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && cats.length === 0 && <div>No cats available</div>}
    </div>
  );
}
