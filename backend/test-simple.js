const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "ollama",
});

async function main() {
  const model = "/models/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf";
  console.log(`Querying LLM with model: ${model}...`);
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Hello, who are you? Please reply in one short sentence." }],
      temperature: 0.7,
      max_tokens: 50
    });
    console.log("Response status: SUCCESS");
    console.log("Content:", JSON.stringify(response.choices[0].message.content));
  } catch (err) {
    console.error("Simple test failed:", err.message);
  }
}

main();
