const axios = require("axios");

async function main() {
  const url = "http://127.0.0.1:8080/v1/chat/completions";
  console.log(`Sending real Scene Slicing POST to ${url}...`);
  
  const payload = {
    model: "/models/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf",
    messages: [
      {
        role: "system",
        content: `You are an expert Literary Editor. Your task is to perform "Scene Slicing" on a story.
Analyze the provided paragraphs and partition them into logical, individual scenes. A scene change occurs when there is a significant shift in time, setting, characters, or narrative focus.

You must return a valid JSON object containing an array of the starting paragraph indices (0-indexed) for each scene.
Example Output:
{"scene_starts": [0, 2, 4]}`
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
    ],
    temperature: 0.2,
    max_tokens: 2000
  };

  try {
    const startTime = Date.now();
    const res = await axios.post(url, payload, { timeout: 60000 });
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`Completed in ${duration}s.`);
    console.log("Status Code:", res.status);
    console.log("Choice 0 Message Content:", JSON.stringify(res.data.choices[0].message.content, null, 2));
    console.log("Choice 0 Message Reasoning Content:", JSON.stringify(res.data.choices[0].message.reasoning_content, null, 2));
    console.log("Full Choice Object:", JSON.stringify(res.data.choices[0], null, 2));
  } catch (error) {
    console.error("POST request failed:", error.message);
    if (error.response) {
      console.error("Response Status:", error.response.status);
      console.error("Response Body:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();
