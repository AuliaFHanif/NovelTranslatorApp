const { Scene, SceneDependency, sequelize } = require("../models");
const { Op } = require("sequelize");
const { detectScenes } = require("./sceneSegmentation");
const TextMetrics = require("../utils/textMetrics");

class SceneCreationService {
  /**
   * Main entry: Create scenes from chapter text
   */
  async createScenesFromChapter(chapterId, rawText, options = {}) {
    const { language = 'zh' } = options;
    
    // Normalize and split into paragraphs
    const paragraphs = this.normalizeParagraphs(rawText);
    
    // Detect scenes using AI
    const scenes = await detectScenes(paragraphs, { language, model: options.model });
    
    console.log(`[SceneCreation] Detected ${scenes.length} scenes for chapter ${chapterId}`);
    
    // Clear existing scenes (hard reset)
    await Scene.destroy({ where: { chapterId } });
    
    // Create scene records
    const createdScenes = [];
    for (let i = 0; i < scenes.length; i++) {
      const sceneData = scenes[i];
      
      const scene = await Scene.create({
        chapterId,
        sequence: i + 1,
        sceneType: sceneData.sceneType,
        rawText: sceneData.rawText,
        tokenCount: sceneData.estimatedTokens,
        charCount: sceneData.charCount,
        wordCount: sceneData.wordCount,
        status: 'segmented',
        analysis: {
          summary: sceneData.summary,
          detectedAt: new Date().toISOString()
        }
      });
      
      createdScenes.push(scene);
      console.log(`[SceneCreation] Scene ${i + 1}: ${sceneData.sceneType}, ${sceneData.estimatedTokens} tokens`);
    }
    
    // Create sequential dependencies
    for (let i = 1; i < createdScenes.length; i++) {
      await SceneDependency.create({
        sceneId: createdScenes[i].id,
        dependsOnSceneId: createdScenes[i - 1].id,
        dependencyType: 'translation_sequence'
      });
    }
    
    return createdScenes;
  }

  /**
   * Update scene text (with auto-split if too large)
   */
  async updateScene(sceneId, newText, options = {}) {
    const scene = await Scene.findByPk(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    
    const wordCount = TextMetrics.countUnifiedWords(newText);
    const maxWords = options.maxWords || 4000; // Configurable
    
    // If within limits, simple update
    if (wordCount <= maxWords) {
      await scene.update({
        rawText: newText,
        wordCount,
        tokenCount: TextMetrics.estimateTokens(newText),
        charCount: newText.length,
        status: 'segmented',
        // Clear downstream work
        translatedText: null,
        finalText: null,
        polishEdits: [],
        analysis: null
      });
      
      return { scene, split: false };
    }
    
    // Auto-split into multiple scenes
    return this.splitScene(scene, newText, options);
  }

  /**
   * Split oversized scene
   */
  async splitScene(originalScene, text, options = {}) {
    const paragraphs = this.normalizeParagraphs(text);
    const scenes = await detectScenes(paragraphs, options);
    
    // Delete original
    await originalScene.destroy();
    
    // Create new scenes with same chapterId, renumbered
    const chapterId = originalScene.chapterId;
    const originalSequence = originalScene.sequence;
    
    // Shift existing scenes down
    await Scene.update(
      { sequence: sequelize.literal('sequence + ' + (scenes.length - 1)) },
      { 
        where: { 
          chapterId, 
          sequence: { [Op.gt]: originalSequence } 
        } 
      }
    );
    
    // Create replacement scenes
    const created = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = await Scene.create({
        chapterId,
        sequence: originalSequence + i,
        sceneType: scenes[i].sceneType,
        rawText: scenes[i].rawText,
        tokenCount: scenes[i].estimatedTokens,
        charCount: scenes[i].charCount,
        wordCount: scenes[i].wordCount,
        status: 'segmented'
      });
      created.push(scene);
    }
    
    return { scenes: created, split: true, count: scenes.length };
  }

  /**
   * Delete scene and renumber
   */
  async deleteScene(sceneId) {
    const scene = await Scene.findByPk(sceneId);
    if (!scene) throw new Error("Scene not found");
    
    const { chapterId, sequence } = scene;
    
    await scene.destroy();
    
    // Renumber remaining scenes
    await sequelize.query(`
      UPDATE "Scenes" 
      SET sequence = sequence - 1 
      WHERE "chapterId" = :chapterId AND sequence > :sequence
    `, {
      replacements: { chapterId, sequence }
    });
    
    // Rebuild dependencies
    await this.rebuildDependencies(chapterId);
    
    return { deleted: true, renumbered: true };
  }

  /**
   * Rebuild sequential dependencies after reordering
   */
  async rebuildDependencies(chapterId) {
    // Delete all sequential dependencies for this chapter
    const sceneIds = await Scene.findAll({
      where: { chapterId },
      attributes: ['id']
    }).then(scenes => scenes.map(s => s.id));

    await SceneDependency.destroy({
      where: { 
        sceneId: { [Op.in]: sceneIds }
      }
    });
    
    const scenes = await Scene.findAll({
      where: { chapterId },
      order: [['sequence', 'ASC']]
    });
    
    for (let i = 1; i < scenes.length; i++) {
      await SceneDependency.create({
        sceneId: scenes[i].id,
        dependsOnSceneId: scenes[i - 1].id,
        dependencyType: 'translation_sequence'
      });
    }
  }

  normalizeParagraphs(text) {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((text, index) => ({ text, index }));
  }
}

module.exports = new SceneCreationService();
