const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

const { Chapter, sequelize } = require("./models");
const OpenAI = require("openai");
const { resolveModel } = require("./services/resolveModel");

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "ollama",
});

async function main() {
  try {
    await sequelize.authenticate();
    const chapter = await Chapter.findOne({ order: [["id", "DESC"]] });
    if (!chapter) {
      console.error("No chapter found.");
      return;
    }

    const paragraphs = chapter.rawText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((text, index) => ({ text, index }));

    const model = await resolveModel(null);
    console.log(`Resolving model: ${model}`);

    const messages = [
      {
        role: "system",
        content: `You are an expert Literary Editor. Your task is to perform "Scene Slicing" on a story.
Return ONLY a valid JSON object containing an array of the starting paragraph indices (0-indexed) for each scene.

CRITICAL INSTRUCTION: Do not write any thinking process, reasoning, planning, explanations, or notes. Bypass all analysis and output ONLY the final JSON object directly.
Example Output:
{"scene_starts": [0, 2, 5]}`
      },
      {
        role: "user",
        content: `Analyze the following story paragraphs (indexed 0 to ${paragraphs.length - 1}) and divide this story into individual scenes:

${paragraphs.map((p, i) => `[Paragraph ${i}]\n${p.text}`).join("\n\n")}`
      }
    ];

    console.log("Sending chat completion request with JSON Object format...");
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.0, // Set to 0.0 for maximum determinism and speed
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Completed in ${duration}s.`);
    console.log("Raw Choice Content:", response.choices[0].message.content);
    console.log("Raw Choice Reasoning Content:", response.choices[0].message.reasoning_content);
    
    const parsed = JSON.parse(response.choices[0].message.content);
    console.log("Parsed scene starts:", parsed.scene_starts);
  } catch (err) {
    console.error("No-reasoning segment test failed:", err);
  } finally {
    await sequelize.close();
  }
}

main();
