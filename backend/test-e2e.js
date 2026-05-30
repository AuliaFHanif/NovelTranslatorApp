const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const { sequelize, Series, Chapter } = require('./models');
const sceneCreation = require('./services/sceneCreation');
const sceneLexicographer = require('./services/sceneLexicographerService');
const sceneTranslation = require('./services/sceneTranslationService');
const scenePolish = require('./services/scenePolishService');

async function main() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    // Use force: true to reset the DB for testing, but let's just sync to be safe
    await sequelize.sync(); 
    console.log('Database connected.');

    // 1. Read the provided Japanese novel
    const novelPath = path.join(__dirname, '..', '..', 'Example_novel_japanese.md');
    console.log(`Reading novel from ${novelPath}`);
    const rawContent = fs.readFileSync(novelPath, 'utf8');
    
    // Take a small chunk to keep testing fast (e.g., first 500 characters)
    const smallChunk = rawContent.substring(0, 1000);

    // 2. Setup Series and Chapter
    const series = await Series.create({
      title: 'Test Japanese Novel',
      language: 'ja'
    });
    console.log(`Created Series ID: ${series.id}`);

    const chapter = await Chapter.create({
      seriesId: series.id,
      number: 1,
      title: 'Chapter 1',
      rawText: smallChunk
    });
    console.log(`Created Chapter ID: ${chapter.id}`);

    const options = { model: 'local-model' }; // Uses whatever model is configured

    // 3. Pass 1: Segmentation
    console.log('\n--- Pass 1: Segmentation ---');
    const scenes = await sceneCreation.createScenesFromChapter(chapter.id, chapter.rawText, options);
    console.log(`Created ${scenes.length} scenes.`);
    
    if (scenes.length === 0) throw new Error('No scenes created.');
    const firstScene = scenes[0];
    
    // 4. Pass 2: Analysis
    console.log('\n--- Pass 2: Analysis ---');
    const analysisResult = await sceneLexicographer.analyzeSceneNarrative(firstScene.id, options);
    console.log('Analysis Result:', JSON.stringify(analysisResult.scene.analysis, null, 2));

    // 5. Pass 3: Extraction
    console.log('\n--- Pass 3: Term Extraction ---');
    const extractionResult = await sceneLexicographer.extractTermsFromScene(firstScene.id, options);
    console.log(`Extracted ${extractionResult.terms?.length || 0} terms.`);
    console.log('Terms:', extractionResult.terms);

    // 6. Pass 4: Translation
    console.log('\n--- Pass 4: Translation ---');
    const translationResult = await sceneTranslation.translateScene(firstScene.id, options);
    console.log('Translation Result Text:', translationResult.translation);

    // 7. Pass 5: Polish
    console.log('\n--- Pass 5: Polish ---');
    const polishResult = await scenePolish.polishScene(firstScene.id, options);
    console.log('Polish Result Edits:', polishResult.edits);

    console.log('\nALL 5 PASSES COMPLETED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('\nERROR DURING PIPELINE TEST:');
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

main();
