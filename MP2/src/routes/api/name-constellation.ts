import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";

type Body = {
  description?: string;
  matchedStarNames?: string[];
};

export const Route = createFileRoute("/api/name-constellation")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const description = (body.description ?? "").trim();
        const matchedStarNames = Array.isArray(body.matchedStarNames)
          ? body.matchedStarNames.filter((s) => typeof s === "string" && s.length > 0)
          : [];

        if (!description) {
          return Response.json({ error: "Description is required" }, { status: 400 });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "GROQ_API_KEY is not configured" }, { status: 500 });
        }

        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [
                {
                  role: "system",
                  content:
                    "You are an astronomer and mythologist who creates names for custom user-invented constellations. Generate a single creative constellation name based on the user's description. The name should feel mythological or cosmic — like real constellation names (Orion, Cassiopeia, Lyra) but completely original. Return ONLY the name, nothing else. No explanation, no punctuation at the end, just the name itself. Maximum 3 words.",
                },
                {
                  role: "user",
                  content: `The user drew a constellation and described it as: "${description}". The stars it connects include: ${
                    matchedStarNames.join(", ") || "unnamed catalog stars"
                  }. Name this constellation.`,
                },
              ],
              max_tokens: 20,
              temperature: 0.9,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            console.error("Groq API error:", response.status, text);
            return Response.json(
              { error: `Groq API error: ${response.status}` },
              { status: 502 },
            );
          }

          const data = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const name = data.choices?.[0]?.message?.content?.trim();
          if (!name) {
            return Response.json({ error: "No name returned" }, { status: 502 });
          }
          return Response.json({ name });
        } catch (err) {
          console.error("name-constellation failed:", err);
          return Response.json({ error: "Request failed" }, { status: 500 });
        }
      },
    },
  },
});
