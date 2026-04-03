const { 
  analysisService, 
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

    const { candidates, approvedCount } = await glossaryProcessing.identifyTerms(extractedTerms, act);

    // Initial pass: no terms approved yet, so it should be a candidate
    expect(candidates.length).toBe(1);
    expect(approvedCount).toBe(0);
    expect(candidates[0].term).toBe('山田太郎');
  });

  test('merges duplicate terms', async () => {
    act.Chapter = chapter;
    chapter.Series = series;

    // First appearance as candidate
    await glossaryProcessing.identifyTerms([{
      term: '山田太郎',
      type: 'character',
      context: 'First appearance.',
      proposedTranslation: 'Yamada Taro',
      confidence: 0.9
    }], act);

    // Approve the term manually to test merging
    const term = await GlossaryTerm.create({
      seriesId: series.id,
      canonicalForm: '山田太郎',
      termJa: '山田太郎',
      termEn: 'Yamada Taro',
      type: 'character',
      status: 'approved'
    });

    // Second appearance in different act
    const act2 = await Act.create({
      chapterId: chapter.id,
      sequence: 2,
      label: '2',
      rawText: 'Second act'
    });
    
    act2.Chapter = chapter;
    act2.Chapter.Series = series;

    const { candidates, approvedCount } = await glossaryProcessing.identifyTerms([{
      term: '山田太郎',
      type: 'character',
      context: 'Second appearance.',
      proposedTranslation: 'Yamada Taro',
      confidence: 0.95
    }], act2);

    expect(approvedCount).toBe(1);
    expect(candidates.length).toBe(0);

    // Should have recorded appearance for approved term
    const appearances = await TermAppearance.findAll({ where: { termId: term.id } });
    expect(appearances.length).toBe(1);
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
