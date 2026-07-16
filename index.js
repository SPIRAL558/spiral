const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// Static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, "public")));

// Home
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Clean URLs — one route per page, no .html in the address bar
const pages = ["about", "services", "projects", "contact", "hosting", "portfolio", "faq", "ai"];

pages.forEach((page) => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(__dirname, "public", `${page}.html`));
    });
});

// Minecraft-inspired game page
app.get("/minecraft", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "minecraft.html"));
});

// Redirect old .html links to the clean version
pages.forEach((page) => {
    app.get(`/${page}.html`, (req, res) => {
        res.redirect(301, `/${page}`);
    });
});

// ---------------------------------------------------------------------------
// SPIRAL AI — chat backend (Groq API, OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;
const SYSTEM_PROMPT = `You are SPIRAL AI, the official AI assistant created by SPIRAL.

About SPIRAL:
- Real Name: Nasooh
- Known As: SPIRAL
- Age: 18
- From: Malappuram, Kerala, India
- Religion: Muslim
- Advanced Python Developer
- Discord Bot Developer
- Minecraft Developer
- Web Developer
- Founder & Owner of XYZEN CLOUD
- Founder & Owner of MATRIX ROLEPLAY

Projects:
- XYZEN PUBLIC BOT
- XYZEN AI BOT
- XYZEN MANAGEMENT BOT
- XYZEN VPS DEPLOY BOT
- THANAL MC SERVER BOT
- MATRIX MANAGEMENT BOT

Gaming:
- Minecraft Username: SPIR4L7733
- SA-MP Name: NJK SPIRAL

Rules:
- Always reply in English only, no matter what language the user writes in.
- You already know you are SPIRAL AI. Only state your name/introduce yourself if the person greets you for the first time or directly asks who you are — do NOT repeat "I'm SPIRAL AI" in every reply.
- Speak in a friendly, professional, and respectful way, like a knowledgeable assistant, not a scripted bot.
- Give complete, helpful, detailed answers — don't just give one-line replies. Explain things properly.
- Answer questions using the information above when relevant to SPIRAL, his projects, or his services.
- You can also answer general questions unrelated to SPIRAL (coding help, general knowledge, advice, etc.) normally and helpfully, like any capable assistant would.
- If you don't know something, say you don't know instead of making up an answer.
- Never claim to be a real person.`;

// Simple in-memory rate limiter per IP (basic abuse protection)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 15;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        entry.count = 0;
        entry.windowStart = now;
    }
    entry.count += 1;
    rateLimitMap.set(ip, entry);
    return entry.count > RATE_LIMIT_MAX;
}

app.post("/api/chat", async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            console.error("GROQ_API_KEY is not set in environment.");
            return res.status(500).json({ error: "AI is not configured on the server." });
        }

        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
        if (isRateLimited(ip)) {
            return res.status(429).json({ error: "Too many messages. Please wait a moment and try again." });
        }

        const { messages } = req.body;
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "No messages provided." });
        }

        // Keep only the last 20 turns to control token usage, always keep system prompt fixed
        const trimmed = messages.slice(-20).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || "").slice(0, 4000),
        }));

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
                temperature: 0.7,
                max_tokens: 1500,
            }),
        });

        if (!groqRes.ok) {
            const errBody = await groqRes.text().catch(() => "");
            console.error("Groq API error:", groqRes.status, errBody);
            return res.status(502).json({ error: "AI service returned an error. Please try again." });
        }

        const data = await groqRes.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "I'm not sure how to respond to that.";

        res.json({ reply });
    } catch (err) {
        console.error("Chat route error:", err);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});

// 404
app.use((req, res) => {
    res.status(404).send("404 - Page Not Found");
});


app.listen(PORT, "0.0.0.0", () => {
    console.log(`Website running on ${PORT}`);
});onsole.log(`Website running on ${PORT}`);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Website running on ${PORT}`);
});