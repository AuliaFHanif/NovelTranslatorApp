const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

const { Chapter, Scene, sequelize } = require("./models");

async function main() {
  try {
    await sequelize.authenticate();
    
    const chapters = await Chapter.findAll({
      order: [["id", "ASC"]]
    });
    
    console.log(`Found ${chapters.length} chapters.`);
    for (const ch of chapters) {
      const scenes = await Scene.findAll({
        where: { chapterId: ch.id },
        order: [["sequence", "ASC"]]
      });
      console.log(`Chapter ${ch.id} (Number=${ch.number}, Title="${ch.title}"):`);
      console.log(`  - Raw text length: ${ch.rawText.length} chars`);
      console.log(`  - Scenes registered: ${scenes.length}`);
      scenes.forEach(s => {
        console.log(`    * Scene ${s.sequence}: ID=${s.id}, wordCount=${s.wordCount}, charCount=${s.charCount}, status=${s.status}`);
      });
    }
  } catch (error) {
    console.error("Database query failed:", error);
  } finally {
    await sequelize.close();
  }
}

main();
