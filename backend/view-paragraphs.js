const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

const { Chapter, sequelize } = require("./models");

async function main() {
  try {
    await sequelize.authenticate();
    
    const chapter = await Chapter.findOne({
      order: [["id", "DESC"]]
    });
    
    if (!chapter) {
      console.error("No chapters found.");
      return;
    }
    
    console.log(`Chapter Title: "${chapter.title}"`);
    const paragraphs = chapter.rawText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
      
    console.log(`Total Paragraphs: ${paragraphs.length}\n`);
    paragraphs.forEach((p, idx) => {
      console.log(`[Paragraph ${idx}] (Length: ${p.length} chars)`);
      console.log(`${p.substring(0, 300)}...\n`);
    });
  } catch (error) {
    console.error("Failed:", error);
  } finally {
    await sequelize.close();
  }
}

main();
