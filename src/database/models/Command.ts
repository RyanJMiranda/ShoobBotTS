import { Model } from 'sequelize';
import type { Optional } from 'sequelize';
import { getSequelize, DataTypes } from '../sequelize.js';

interface CommandAttributes {
  id: number;
  name: string;
  description: string;
  lastUpdated: number;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CommandCreationAttributes
  extends Optional<CommandAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

export class Command
  extends Model<CommandAttributes, CommandCreationAttributes>
  implements CommandAttributes{};

export function initializeModel(): typeof Command {
  const sequelize = getSequelize();

  Command.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      lastUpdated: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      checksum: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'commands',
      timestamps: true,
      modelName: 'Command',
    }
  );

  return Command;
}