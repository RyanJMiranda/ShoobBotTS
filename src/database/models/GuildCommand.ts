// src/database/models/GuildCommand.ts
import { Model } from 'sequelize';
import type { Optional } from 'sequelize';
import { getSequelize, DataTypes } from '../sequelize.js';

interface GuildCommandAttributes {
  id: number;
  name: string;
  description: string;
  guildId: string;
  lastUpdated: number;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

interface GuildCommandCreationAttributes
  extends Optional<GuildCommandAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

export class GuildCommand
  extends Model<GuildCommandAttributes, GuildCommandCreationAttributes>
  implements GuildCommandAttributes {}

export function initializeModel(): typeof GuildCommand { 
  const sequelize = getSequelize();

  GuildCommand.init(
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
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      guildId: {
        type: DataTypes.STRING,
        allowNull: false,
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
      tableName: 'guild_commands',
      timestamps: true,
      modelName: 'GuildCommand',
    }
  );

  return GuildCommand;
}