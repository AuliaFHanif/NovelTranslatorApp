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

function compressParagraph(text, maxLength = 300) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  
  const slice = trimmed.substring(0, maxLength);
  const lastPeriod = Math.max(
    slice.lastIndexOf("。"),
    slice.lastIndexOf("."),
    slice.lastIndexOf("？"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("!")
  );
  
  if (lastPeriod > maxLength * 0.7) {
    return trimmed.substring(0, lastPeriod + 1);
  }
  
  return slice.trim() + "...";
}

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
Analyze the provided paragraph transition hooks and partition them into logical, individual scenes. A scene change occurs when there is a significant shift in time, setting, characters, or narrative focus.

You must return a valid JSON object containing an array of the starting paragraph indices (0-indexed) for each scene.
Example Output:
{"scene_starts": [0, 2, 5]}`
      },
      {
        role: "user",
        content: `Analyze the following paragraph starters (indexed 0 to ${paragraphs.length - 1}) and divide this story into individual scenes:

${paragraphs.map((p, i) => `[Paragraph ${i}]\n${compressParagraph(p.text, 300)}`).join("\n\n")}`
      }
    ];

    console.log("Sending chat completion request with JSON Object format...");
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Completed in ${duration}s.`);
    console.log("Raw Choice Content:", JSON.stringify(response.choices[0].message.content, null, 2));
    console.log("Raw Choice Reasoning Content:", JSON.stringify(response.choices[0].message.reasoning_content, null, 2));
    console.log("Finish Reason:", response.choices[0].finish_reason);
    
    if (response.choices[0].message.content) {
      const parsed = JSON.parse(response.choices[0].message.content);
      console.log("Parsed scene starts:", parsed.scene_starts);
    } else {
      console.log("No content was returned. Model was likely cut off during reasoning.");
    }
  } catch (err) {
    console.error("Compressed 300 segment test failed:", err);
  } finally {
    await sequelize.close();
  }
}

main();
