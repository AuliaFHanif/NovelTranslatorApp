'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Polish extends Model {
    static associate(models) {
      if (models.Act) {
        Polish.belongsTo(models.Act, {
          foreignKey: 'actId',
          as: 'Act'
        });
      }
      if (models.SubAct) {
        Polish.belongsTo(models.SubAct, {
          foreignKey: 'subActId',
          as: 'SubAct'
        });
      }
    }
  }

  Polish.init({
    actId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    subActId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'SubActs',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    scope: {
      type: DataTypes.ENUM('act', 'subact'),
      allowNull: false,
      defaultValue: 'act'
    },
    modelUsed: {
      type: DataTypes.STRING,
      allowNull: true
    },
    originalText: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Snapshot of the text before this polish was applied'
    },
    polishedText: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isSelected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'Polish',
    tableName: 'Polishes',
    timestamps: true,
    validate: {
      eitherActOrSubAct() {
        if ((this.actId === null) === (this.subActId === null)) {
          throw new Error('Exactly one of actId or subActId must be set');
        }
      }
    }
  });

  return Polish;
};
