function cleanText(text) {
  // 1. Remove standard blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  
  // 2. Remove orphaned closing tag and everything before it
  // This handles "Thinking Process: ... </think>" as well
  if (cleaned.includes("</think>")) {
    const parts = cleaned.split("</think>");
    cleaned = parts[parts.length - 1];
  }
  
  // 3. Just in case, also handle "Thinking Process:" without a closing tag if it exists at the start
  // (Optional: Depends on if the user wants this. They said "instead of an opening tag", implying closing exists)
  
  return cleaned.trim();
}

const testCases = [
  {
    name: "Thinking Process with closing tag",
    input: "Thinking Process: I am thinking about the best way to translate this Japanese text into English. I will use formal tone. </think>This is the formal translation."
  },
  {
    name: "Regular think tag",
    input: "<think>Reasoning</think>Translation"
  }
];

testCases.forEach(tc => {
  console.log(`--- ${tc.name} ---`);
  console.log(`Input: "${tc.input.replace(/\n/g, '\\n')}"`);
  console.log(`Output: "${cleanText(tc.input)}"`);
});
