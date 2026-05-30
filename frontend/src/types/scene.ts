// types/scene.ts
export interface Scene {
  id: number;
  chapterId: number;
  sequence: number;
  sceneType: 'dialogue' | 'action' | 'transition' | 'exposition' | 'climax';
  rawText: string;
  translatedText?: string;
  finalText?: string;
  status: 'pending' | 'segmented' | 'analyzed' | 'translated' | 'polished' | 'complete';
  analysis?: {
    summary: string;
    analyzedAt?: string;
    primaryEmotion?: string;
    emotionalIntensity?: number;
    pacingPattern?: string;
    emotionalTone?: {
      primary: string;
      intensity: number;
    };
    emotionalExpression?: {
      primary: string;
      intensity?: number;
      directness?: string;
    };
    kokyu?: {
      pattern: string;
      avgSentenceLength: number;
    };
    kuaiMan?: {
      dominantPattern?: string;
    };
    faceSystem?: {
      faceThreatPresent: boolean;
    };
    powerDynamic?: {
      type: string;
    };
    linguistic?: {
      language: string;
      sentenceStructure?: string;
      proDrop?: {
        frequency: number;
      };
      topicProminence?: {
        frequency: number;
        examples?: string[];
      };
      onomatopoeia?: {
        density: string;
      };
      honorifics?: {
        density: string;
      };
      fourCharacterIdioms?: { idiom: string; meaning: string }[];
    };
  };
  polishEdits?: PolishEdit[];
  contextSummary?: string;
  tokenCount: number;
  wordCount: number;
}

export interface PolishEdit {
  original: string;
  replacement: string;
  reason: string;
  applied: boolean;
}

export interface Chapter {
  id: number;
  seriesId: number;
  number: number;
  title?: string;
  rawText: string;
  finalText?: string;
  status: string;
  Scenes?: Scene[];
  Series?: {
    id: number;
    title: string;
    language: string;
  };
}
