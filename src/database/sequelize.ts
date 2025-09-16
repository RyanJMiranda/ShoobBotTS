// src/database/sequelize.ts
import { Sequelize, DataTypes } from 'sequelize';
import type { Options } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { logToConsole } from '../utils/logger.js';
import { formatLogTimestamp } from '../utils/datetime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../../', 'main.sqlite');

let sequelizeInstance: Sequelize | null = null;

export async function initializeSequelize(): Promise<Sequelize> {
  if (sequelizeInstance) {
    return sequelizeInstance;
  }

  const dataDir = path.dirname(DB_PATH);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const options: Options = {
    dialect: 'sqlite',
    storage: DB_PATH,
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  };

  sequelizeInstance = new Sequelize(options);

  try {
    await sequelizeInstance.authenticate();
    logToConsole('success', 'SEQUELIZE', `Database connection successfully established.`);
  } catch (error) {
    logToConsole('danger', 'SEQUELIZE', `Database connection could not be established: ${error}`);
    throw error;
  }

  return sequelizeInstance;
}

export function getSequelize(): Sequelize {
  if (!sequelizeInstance) {
    throw new Error(
      formatLogTimestamp() + '🟥 Sequelize not initialized. Call initializeSequelize() first.'
    );
  }
  return sequelizeInstance;
}

export { DataTypes };