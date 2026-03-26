const { sequelize, Series, Chapter } = require("./models");

async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...\n");

    await sequelize.authenticate();
    console.log("✓ Database connection successful");

    // Create test series
    const series = await Series.create({
      title: "Demo Novel - Japanese",
      language: "ja",
      genre: "Fiction",
      description: "A test series for the Anatomy Engine",
    });
    console.log(`✓ Created Series: "${series.title}" (ID: ${series.id})`);

    // Create test chapters
    const chapterData = [
      {
        seriesId: series.id,
        number: 1,
        title: "Chapter 1: Beginning",
        rawText:
          "ここから物語が始まります。主人公は目を開けました。朝日が部屋を照らしていました。彼は何か大切なことを忘れているような気がしました。",
      },
      {
        seriesId: series.id,
        number: 2,
        title: "Chapter 2: Discovery",
        rawText:
          "床の上には古い手紙がありました。彼はそれを拾い上げて、慎重に開きました。やがて手紙の内容を読むにつれて、彼の顔は青ざめていきました。",
      },
    ];

    for (const data of chapterData) {
      const chapter = await Chapter.create(data);
      console.log(`✓ Created Chapter: "${chapter.title}" (ID: ${chapter.id})`);
    }

    console.log("\n✓ Database seeding completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("✗ Seeding failed:", error.message);
    process.exit(1);
  }
}

// Run seeding
seedDatabase();
