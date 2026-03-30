const text = `
<think>
I should translate this carefully.
The user wants a faithful translation.
</think>
This is the actual translation content.

<think>Another thought</think>
Final bit of text.
`;

const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
console.log("Original length:", text.length);
console.log("Cleaned length:", cleaned.length);
console.log("Cleaned content:", cleaned);

if (cleaned.includes("<think>") || cleaned.includes("</think>")) {
  console.log("TEST FAILED: think blocks still present");
} else if (cleaned.includes("actual translation content") && cleaned.includes("Final bit of text")) {
  console.log("TEST PASSED: reasoning stripped, content preserved");
} else {
  console.log("TEST FAILED: something else went wrong");
}
