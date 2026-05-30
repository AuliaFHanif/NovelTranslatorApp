const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

const { Chapter, Scene, sequelize } = require("./models");
const { detectScenes } = require("./services/sceneSegmentation");

async function main() {
  try {
    console.log("Connecting to database...");
    await sequelize.authenticate();
    console.log("Database connected successfully.");

    // Find a chapter with text
    const chapter = await Chapter.findOne({
      order: [["id", "DESC"]]
    });

    if (!chapter) {
      console.error("No chapters found in the database. Please create a chapter first.");
      process.exit(1);
    }

    console.log(`Loaded chapter: ID=${chapter.id}, Number=${chapter.number}, Title="${chapter.title}"`);
    console.log(`Text length: ${chapter.rawText.length} characters`);

    const paragraphs = chapter.rawText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((text, index) => ({ text, index }));

    console.log(`Total paragraphs parsed: ${paragraphs.length}`);

    if (paragraphs.length === 0) {
      console.error("Chapter has no paragraphs.");
      process.exit(1);
    }

    // Call detectScenes directly
    console.log("Invoking detectScenes...");
    
    // We will override console.log in the service or check standard logs
    const scenes = await detectScenes(paragraphs, { model: null });
    
    console.log("==================================================");
    console.log(`RESULT: Detected ${scenes.length} scenes.`);
    scenes.forEach((scene, i) => {
      console.log(`Scene ${i + 1}: Type="${scene.sceneType}", Paragraphs=${scene.paragraphs.length}, Words=${scene.wordCount}`);
      console.log(`Snippet: ${scene.rawText.substring(0, 150)}...\n`);
    });

  } catch (error) {
    console.error("An error occurred during verification:", error);
  } finally {
    await sequelize.close();
  }
}

main();
