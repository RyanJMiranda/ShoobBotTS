// src/modules/index.ts
import { Client } from 'discord.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { formatLogTimestamp } from '../utils/datetime.js';

// ESM equivalent of __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const moduleFunctions = new Map<string, (client: Client) => Promise<void>>();

/**
 * Loads and initializes all module files found in the 'src/modules' directory.
 * Each module file is expected to export a default asynchronous function
 * that takes the Discord client as an argument.
 *
 * @param client The Discord client instance.
 */
export async function loadModules(client: Client): Promise<void> {
  console.log(formatLogTimestamp() + '🔄 Modules: Starting to load modules from src/modules...');

  const modulesDir = path.join(__dirname);
  const moduleFiles = (await fs.readdir(modulesDir)).filter((file) =>
    file.endsWith('.ts')
  );

  for (const file of moduleFiles) {
    if (file === 'index.ts') continue;

    const moduleName = path.parse(file).name;
    const filePath = path.join(modulesDir, file.replace('.ts', '.js'));
    const fileUrl = pathToFileURL(filePath).href;

    try {
      const module = await import(fileUrl);

      if (typeof module.default === 'function') {
        moduleFunctions.set(moduleName, module.default);
        await module.default(client);
        console.log(formatLogTimestamp() + `🟩 Modules: ${moduleName} Loaded & Initialized`);
      } else {
        console.warn(
          formatLogTimestamp() + `🟨 Modules: Module ${moduleName} does not export a default function. Skipping.`
        );
      }
    } catch (error) {
      console.error(formatLogTimestamp() + `🟥 Modules: Error loading or initializing module from ${file}:`, error);
      console.error(error);
    }
  }

  console.log(formatLogTimestamp() + '☑️  Modules: All module loading attempts complete.');
}