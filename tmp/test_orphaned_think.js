function cleanText(text) {
  // 1. Remove standard blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  
  // 2. Remove orphaned closing tag and everything before it
  if (cleaned.includes("</think>")) {
    const parts = cleaned.split("</think>");
    // Take everything after the last </think>
    cleaned = parts[parts.length - 1];
  }
  
  return cleaned.trim();
}

const testCases = [
  {
    name: "Standard",
    input: "<think>Reasoning</think>Actual translation"
  },
  {
    name: "Orphaned closing",
    input: "Reasoning here. Ready to translate. </think>Actual translation"
  },
  {
    name: "Multiple orphaned (unlikely but possible)",
    input: "Reasoning 1 </think> Reasoning 2 </think>Actual translation"
  },
  {
    name: "No tags",
    input: "Just the translation"
  }
];

testCases.forEach(tc => {
  console.log(`--- ${tc.name} ---`);
  console.log(`Input: "${tc.input.replace(/\n/g, '\\n')}"`);
  console.log(`Output: "${cleanText(tc.input)}"`);
});
