module.exports = {
  // Phase 2 services
  paragraphNormalizer: require('./paragraphNormalizer'),
  aiSegmentation: require('./aiSegmentation'),
  actCreation: require('./actCreation'),

  // Phase 3 services
  combinedAnalysis: require('./combinedAnalysis'),
  glossaryProcessing: require('./glossaryProcessing'),
  strategyGenerator: require('./strategyGenerator')
};
