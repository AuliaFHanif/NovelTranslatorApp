const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "ollama",
});

async function runTest(useJsonObject) {
  const model = "/models/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf";
  console.log(`\n========================================`);
  console.log(`Running test with useJsonObject=${useJsonObject}...`);

  const messages = [
    {
      role: "system",
      content: `You are an expert Literary Editor. Your task is to perform "Scene Slicing" on a story.
Analyze the provided paragraphs and partition them into logical, individual scenes. A scene change occurs when there is a significant shift in time, setting, characters, or narrative focus.

You must return a valid JSON object containing an array of the starting paragraph indices (0-indexed) for each scene.
Example Output:
{"scene_starts": [0, 5, 8]}`
    },
    {
      role: "user",
      content: `Analyze the following story paragraphs (indexed 0 to 4) and divide this story into individual scenes:

[Paragraph 0]
The carriage rattled along the mountain path as the sun began to set behind the peaks. Master Li sighed, adjusting his robes against the evening chill. "How long until we reach the temple, Shen?"

[Paragraph 1]
Shen whipped the horses, keeping his eyes on the road. "Before midnight, Master. Assuming the pass remains clear."

[Paragraph 2]
Suddenly, a loud crash echoed from the forest. A massive boulder tumbled onto the road, blocking their path. Shen pulled the reins hard, the horses whinnying in terror.

[Paragraph 3]
"Ambush!" Shen yelled, reaching for his sword. Three figures dressed in black jumped from the treeline, blades gleaming in the dim moonlight.

[Paragraph 4]
Three hours later, Master Li sat in the quiet courtyard of the mountain temple, sipping hot tea. The tea was bitter, but it did its job of calming his nerves. Shen stood nearby, his arm bandaged but his stance firm.`
    }
  ];

  const startTime = Date.now();
  try {
    const payload = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 300
    };

    if (useJsonObject) {
      payload.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(payload);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`Completed in ${duration}s.`);
    console.log("Raw Response Content:");
    console.log(response.choices[0].message.content);
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

async function main() {
  // Test 1: Plain text request with JSON instruction
  await runTest(false);
  
  // Test 2: json_object request
  await runTest(true);
}

main();
