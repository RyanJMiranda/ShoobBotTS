import { Client } from 'discord.js';
import { Sequelize } from 'sequelize';
import { syncModels } from '../database/seeders/index.js';
import { loadModules } from '../modules/index.js';
import { loadCommands } from '../commands/index.js';
import { logToConsole } from '../utils/logger.js';

/**
 * Handles the 'ready' event for the Discord client.
 * @param client The Discord client instance.
 * @param sequelize The Sequelize instance for database operations.
 */
export async function onReady(client: Client, sequelize: Sequelize): Promise<void> {
  logToConsole('process_start', 'READY_EVENT_HANDLER', `Logged in as ${client.user?.tag}`);

  try {
    await syncModels(sequelize);
    await loadModules(client);
    await loadCommands(client, sequelize, process.env.DISCORD_CLIENT_ID!);
    logToConsole('process_end', 'READY_EVENT_HANDLER', `Finished Ready Event. Awaiting further interactions.`);
  } catch (error) {
    logToConsole('danger', 'READY_EVENT_HANDLER', `Error During Ready Event initialization: ${error}`);
  }
}