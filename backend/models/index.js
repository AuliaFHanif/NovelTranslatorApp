'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// Import models explicitly for clean schema layout
const Series = require('./Series')(sequelize, Sequelize.DataTypes);
const Chapter = require('./Chapter')(sequelize, Sequelize.DataTypes);
const Act = require('./Act')(sequelize, Sequelize.DataTypes);
const GlossaryTerm = require('./GlossaryTerm')(sequelize, Sequelize.DataTypes);
const TermAppearance = require('./TermAppearance')(sequelize, Sequelize.DataTypes);
const ActDependency = require('./ActDependency')(sequelize, Sequelize.DataTypes);
const PolishEdit = require('./PolishEdit')(sequelize, Sequelize.DataTypes);
const Polish = require('./Polish')(sequelize, Sequelize.DataTypes);
const SubAct = require('./SubAct')(sequelize, Sequelize.DataTypes);
const Analysis = require('./Analysis')(sequelize, Sequelize.DataTypes);

// Old models that survived the refactor (not directly linked to new core sequence)
const Genre = require('./genre.js')(sequelize, Sequelize.DataTypes);
const AIModel = require('./aimodel.js')(sequelize, Sequelize.DataTypes);

// Store in db object
db.Series = Series;
db.Chapter = Chapter;
db.Act = Act;
db.GlossaryTerm = GlossaryTerm;
db.TermAppearance = TermAppearance;
db.ActDependency = ActDependency;
db.PolishEdit = PolishEdit;
db.Polish = Polish;
db.SubAct = SubAct;
db.Analysis = Analysis;

db.Genre = Genre;
db.AIModel = AIModel;

// Define associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
