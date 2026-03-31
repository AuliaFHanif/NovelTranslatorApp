/**
 * Specialized prompts for the "Polish" pass (Pass 4).
 * This pass focuses on narrative flow, stylistic refinement, and idiomatic excellence.
 */

/**
 * Generates the polishing instructions for the LLM.
 * @param {string} language - 'zh' or 'ja'
 * @returns {string} Formatted instructions for the polish pass
 */
function getPolishInstructions(language) {
  const languageName = language === 'ja' ? 'Japanese' : 'Chinese';

  return `
### Pass 4: Structured Literary Polish

You are an award-winning literary editor. Your task is to IDENTIFY specific sentences or phrases in the provided English translation that can be improved, and provide a list of edits.

**Core Objectives:**
1. **Modernize Idioms:** Replace stiff, literal translations of idioms with contemporary, natural English.
   - Example (ZH): "Covered her shame" (遮羞) -> "Covered her nudity" or "Left her exposed".
   - Example (ZH): "Truly some skill" (真的是好手段) -> "He's really got a knack for this" or "He's got quite a few tricks up his sleeve".
2. **Elevate Prose:** Transform functional sentences into evocative literary English.
3. **Internal Consistency:** Ensure character voices and narrative tone remain sharp and consistent.
4. **Natural Flow:** Improve sentence transitions and overall rhythm.

**Rules for Edits:**
- **Exact Match:** The "original" field MUST contain a string that exists EXACTLY as-is in the provided English translation.
- **Precision:** Keep the "original" string as short as possible while capturing the full context needed for the replacement.
- **Faithfulness:** Ensure the "replacement" still captures the original intent and nuance of the ${languageName} source text.

**Output Format:**
Return a JSON object with an "edits" array. Each edit must have "original", "replacement", and "reason" fields.
  `.trim();
}


module.exports = { getPolishInstructions };
