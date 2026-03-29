const { 
  combinedAnalysis, 
  glossaryProcessing, 
  strategyGenerator 
} = require('../services');
const { sequelize, Series, Chapter, Act, GlossaryTerm, TermAppearance } = require('../models');

describe('Phase 3 with New Schema', () => {
  let series, chapter, act;

  beforeAll(async () => {
    // Only syncing needed tables for tests to prevent full schema wipe issues if running locally on dev
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    // Clear out tables before each test
    await TermAppearance.destroy({ where: {} });
    await GlossaryTerm.destroy({ where: {} });
    await Act.destroy({ where: {} });
    await Chapter.destroy({ where: {} });
    await Series.destroy({ where: {} });

    series = await Series.create({
      title: 'Test Novel',
      language: 'ja'
    });

    chapter = await Chapter.create({
      seriesId: series.id,
      number: 1,
      rawText: 'test'
    });

    act = await Act.create({
      chapterId: chapter.id,
      sequence: 1,
      label: '1',
      rawText: 'テストテキスト。山田太郎が登場した。'
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('processes glossary terms into linking table', async () => {
    const extractedTerms = [{
      term: '山田太郎',
      type: 'character',
      context: '山田太郎が登場した。',
      proposedTranslation: 'Yamada Taro',
      confidence: 0.95
    }];

    // Attach chapter/series for the service to use
    act.Chapter = chapter;
    chapter.Series = series;

    const stats = await glossaryProcessing.processTerms(extractedTerms, act);

    expect(stats.created).toBe(1);
    expect(stats.appearances).toBe(1);

    // Verify linking table record
    const appearance = await TermAppearance.findOne({
      where: { actId: act.id }
    });

    expect(appearance).toBeTruthy();
    expect(appearance.contextSentence).toBe('山田太郎が登場した。');

    // Verify term created
    const term = await GlossaryTerm.findByPk(appearance.termId);
    expect(term.canonicalForm).toBe('山田太郎');
    expect(term.status).toBe('pending');
  });

  test('merges duplicate terms', async () => {
    act.Chapter = chapter;
    chapter.Series = series;

    // First appearance
    await glossaryProcessing.processTerms([{
      term: '山田太郎',
      type: 'character',
      context: 'First appearance.',
      proposedTranslation: 'Yamada Taro',
      confidence: 0.9
    }], act);

    // Second appearance in different act
    const act2 = await Act.create({
      chapterId: chapter.id,
      sequence: 2,
      label: '2',
      rawText: 'Second act'
    });
    
    act2.Chapter = chapter;

    const stats = await glossaryProcessing.processTerms([{
      term: '山田太郎',
      type: 'character',
      context: 'Second appearance.',
      proposedTranslation: 'Yamada Taro',
      confidence: 0.95
    }], act2);

    expect(stats.merged).toBe(1);

    // Should have 2 appearances
    const appearances = await TermAppearance.findAll();
    expect(appearances.length).toBe(2);
  });

  test('generates act strategy from analysis', () => {
    const narrative = {
      primaryEmotion: 'distress',
      emotionalIntensity: 0.85,
      pacingPattern: 'man',
      emotionalTone: { enryo: true }
    };

    const linguistic = {
      language: 'ja',
      sentenceStructure: 'SOV',
      proDrop: { frequency: 0.7 },
      honorifics: { density: 'high' }
    };

    const strategy = strategyGenerator.generateActStrategy(narrative, linguistic);

    expect(strategy.primaryEmotion).toBe('distress');
    expect(strategy.sentenceLengthTarget).toBe('long');
    expect(strategy.enryo).toBe(true);
    expect(strategy.honorificStrategy).toBe('retain_keigo');
  });

  test('aggregates chapter strategy', async () => {
    const acts = [
      { anatomyProfile: { linguistic: { language: 'ja', onomatopoeia: { density: 'high' } }, narrative: { pacingPattern: 'man', primaryEmotion: 'distress' } } },
      { anatomyProfile: { linguistic: { language: 'ja', onomatopoeia: { density: 'low' } }, narrative: { pacingPattern: 'man', primaryEmotion: 'anger' } } }
    ];

    const strategy = strategyGenerator.aggregateChapterStrategy(acts);

    expect(strategy.language).toBe('ja');
    expect(strategy.onomatopoeiaStrategy).toBe('romanize_with_context');
    expect(strategy.pacingConsistency).toBe('uniform');
    expect(strategy.emotionalArc).toEqual(['distress', 'anger']);
  });
});
