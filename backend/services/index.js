module.exports = {
  // Phase 2 services
  paragraphNormalizer: require('./paragraphNormalizer'),
  aiSegmentation: require('./aiSegmentation'),
  actCreation: require('./actCreation'),

  // Phase 3 services
  analysisService: require('./analysisService'),
  glossaryProcessing: require('./glossaryProcessing'),
  strategyGenerator: require('./strategyGenerator')
};
