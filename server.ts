import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Initialize Gemini client lazily or when requested
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Healthcheck endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // API endpoint: AI Block Diagnostic & Compression Analysis
  app.post("/api/gemini/explain-block", async (req, res) => {
    try {
      const { mode, partition, endpoints, pbits, rotation, indices, texels, psnr } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are a Senior Graphics Engineer & GPU Compression Expert specializing in BC7 / BPTC texture compression.
Analyze the following BC7 4x4 texel block compression result:
- BC7 Mode: ${mode}
- Partition Index: ${partition !== undefined ? partition : "None"}
- Decoded Endpoints: ${JSON.stringify(endpoints)}
- P-bits: ${JSON.stringify(pbits)}
- Rotation Mode: ${rotation}
- Block PSNR: ${psnr ? psnr.toFixed(2) + " dB" : "N/A"}
- Original Texels 4x4 RGBA Sample: ${JSON.stringify(texels?.slice(0, 4))}...

Please provide a concise, technical breakdown in Chinese (Simplified 中文):
1. **模式选择原因 (Why Mode ${mode})**: Explain why this mode fits these texels (subsets, color precision, alpha handling, index precision).
2. **端点与P-bit剖析 (Endpoint & Parity Bit Analysis)**: Analyze endpoint color range and precision bit expansion.
3. **视觉画质评估 (Visual Quality & Artifacts)**: Evaluate potential compression artifacts or color bleeding for this block.
4. **性能/硬件建议 (Hardware & Optimization Advice)**: Quick practical tip for texture artists or graphics devs.

Keep the response structured, clear, and professional.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error in explain-block:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI analysis." });
    }
  });

  // API endpoint: AI BC7 Learning Assistant Q&A
  app.post("/api/gemini/qa", async (req, res) => {
    try {
      const { question, topic } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are an interactive GPU Texture Compression Expert. The user is asking a question about BC7 / BC1-BC7 / ASTC / DirectX / Vulkan texture compression.

Topic context: ${topic || "BC7 Algorithm"}
User Question: "${question}"

Provide an accurate, educational, clear answer in Simplified Chinese (中文). Use markdown formatting with bullet points and code/bit diagrams where helpful.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error in QA:", error);
      res.status(500).json({ error: error.message || "Failed to answer question." });
    }
  });

  // Vite middleware for dev or static server for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BC7 Inspector server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
