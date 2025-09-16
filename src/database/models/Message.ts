import { Model } from 'sequelize';
import type { Optional } from 'sequelize';
import { getSequelize, DataTypes } from '../sequelize.js';

interface MessageAttributes {
  id: number;
  server_id: string;
  channel_id: string;
  message: string;
  message_title: string;
  message_type: 'message' | 'embed';
  color: string | null;
  footer_text: string | null;
  repeat_hours: number;
  times_sent: number;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  message_active: 0 | 1;
}
interface MessageCreationAttributes
  extends Optional<
    MessageAttributes,
    'id' | 'color' | 'footer_text' | 'lastRunAt' | 'nextRunAt' | 'createdAt' | 'updatedAt' | 'times_sent'
  > {}

export class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes{}

/**
 * Initializes the Message model with Sequelize.
 */
export function initializeModel(): typeof Message {
  const sequelize = getSequelize();

  Message.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      server_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      channel_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      message_title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message_type: {
        type: DataTypes.ENUM('message', 'embed'),
        defaultValue: 'message',
        allowNull: false,
      },
      color: {
        type: DataTypes.STRING(7),
        allowNull: true,
        defaultValue: null,
      },
      footer_text: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      repeat_hours: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      times_sent: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      lastRunAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      nextRunAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      message_active: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'messages',
      timestamps: true,
      modelName: 'Message',
    }
  );

  return Message;
}