// Vercel serverless function: /api/chat
// Calls Google's Gemini API (free tier) to answer visitor questions about
// American ADU Experts, grounded in a fixed knowledge base below.
// Requires the GEMINI_API_KEY environment variable to be set in Vercel
// (Project Settings -> Environment Variables). Get a free key at
// https://aistudio.google.com/apikey

const SYSTEM_PROMPT = [
  "You are the website chat assistant for American ADU Experts, a California ADU (accessory dwelling unit) building company. ",
  "You are friendly, concise, and helpful. Keep replies short (2-5 sentences) unless the visitor asks for detail. ",
  "Use plain text only, no markdown formatting.",
  "\n\nCOMPANY FACTS (use these, do not invent additional facts):",
  "- Name: American ADU Experts. Tagline: California's Trusted ADU Builder.",
  "- 20+ years of experience. General contractors. Serves all of California.",
  "- Phone: (949) 123-4567. Email: info@americanaduexperts.com.",
  "- Services: full-service ADU design and construction, including design, permitting, construction, interior finishes, and landscaping.",
  "- Process, in order: 1) Free Consultation, 2) Custom Design, 3) Planning & Permits, 4) Construction, 5) Interior Finishes, 6) Landscaping & Final Walkthrough.",
  "- Strengths: custom designs tailored to style/needs/budget, competitive pricing, fast and efficient process, satisfaction guaranteed.",
  "- The website has a 'Build Your Custom ADU' button/form where visitors can submit their name, contact info, desired ADU size in square feet, and a photo of their current home, so the design team can prepare custom sketch options.",
  "\n\nCALIFORNIA ADU BASICS (general public information, current as of 2026 sources; always add that specifics vary by city/county):",
  "- Under state law, most ADUs are not subject to an owner-occupancy requirement (this differs for junior ADUs / JADUs that share sanitation facilities with the main home, which do require owner-occupancy).",
  "- Local agencies must approve or deny a complete ADU application within 60 days.",
  "- Allowed ADU size depends on lot, zoning, and ADU type; state law guarantees certain minimum sizes must be allowed regardless of other local restrictions, but exact limits vary by city. Always recommend confirming exact numbers with the American ADU Experts team for the visitor's specific property.",
  "\n\nSTRICT RULES:",
  "- NEVER state a specific price, dollar amount, price range, or cost estimate for any project, even if asked directly or pressured. If asked about cost, budget, or pricing, explain that costs depend on size, design, and site conditions, and direct them to schedule a free consultation or call (949) 123-4567 / email info@americanaduexperts.com for an accurate quote.",
  "- Do not give definitive legal, zoning, or permitting advice for a specific address. Give general information only and recommend the visitor confirm specifics with the team.",
  "- If you don't know the answer to something, say so honestly and direct the visitor to contact the team directly rather than guessing.",
  "- Do not discuss topics unrelated to ADUs, this company, or home construction. If asked something off-topic, politely redirect to how you can help with their ADU project.",
  "- Never claim to be human. If asked, say you're an AI assistant for American ADU Experts.",
].join("");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Chat is not configured yet (missing API key)." });
  }

  let body;
  try {
    body =
      req.body && typeof req.body === "object"
        ? req.body
        : JSON.parse(req.body || "{}");
  } catch (e) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  // Keep only the most recent turns and cap message length to bound cost/abuse.
  const trimmed = messages.slice(-12);
  const contents = trimmed
    .filter(
      (m) =>
        m &&
        typeof m.text === "string" &&
        m.text.trim().length > 0 &&
        (m.role === "user" || m.role === "model")
    )
    .map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, 2000) }] }));

  if (contents.length === 0) {
    return res.status(400).json({ error: "No message provided." });
  }

  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { temperature: 0.4, maxOutputTokens: 350 },
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gemini API error:", resp.status, errText);
      return res
        .status(502)
        .json({ error: "The chat assistant is temporarily unavailable. Please try again in a moment, or call (949) 123-4567." });
    }

    const data = await resp.json();
    const reply =
      (data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map((p) => p.text || "").join("")) ||
      "Sorry, I wasn't able to come up with a response. Please try rephrasing, or contact us directly at (949) 123-4567.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Chat handler error:", err);
    return res.status(500).json({
      error:
        "Something went wrong. Please try again, or contact us directly at (949) 123-4567.",
    });
  }
}
