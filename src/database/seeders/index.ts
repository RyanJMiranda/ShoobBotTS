import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { logToConsole } from '../../utils/logger.js';

// ESM equivalent of __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes all Sequelize models found in the 'src/database/models' directory
 * and then synchronizes them with the database.
 * This should be called once the Sequelize connection is established.
 *
 * @param sequelize The initialized Sequelize instance.
 */
export async function syncModels(sequelize: Sequelize): Promise<void> {
  logToConsole('process_start', 'MODEL_SEEDER', 'Initializing models & database connection.');

  const modelsDir = path.resolve(__dirname, '../models');
  const modelFiles = (await fs.readdir(modelsDir)).filter((file) =>
    file.endsWith('.ts')
  );

  for (const file of modelFiles) {
    const modelName = path.parse(file).name;
    try {
      const filePath = path.join(modelsDir, file.replace('.ts', '.js'));
      const fileUrl = pathToFileURL(filePath).href;
      const modelModule = await import(fileUrl);

      if (typeof modelModule.initializeModel === 'function') {
        modelModule.initializeModel();
        logToConsole('success', 'MODEL_SEEDER', `${modelName} has been successfully initialized.`);
      } else {
        logToConsole('warning', 'MODEL_SEEDER', `${file} does not export an 'initializeModel' function.`);
      }
    } catch (error) {
      logToConsole('danger', 'MODEL_SEEDER', `Error loading or initializing model from ${file}: ${error}`);
    }
  }

  await sequelize.sync({ alter: true });
  logToConsole('process_end', 'MODEL_SEEDER', `All models synchronized with the database`);
}