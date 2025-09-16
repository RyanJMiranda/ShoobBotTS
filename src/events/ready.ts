import { Client } from 'discord.js';
import { Sequelize } from 'sequelize';
import { syncModels } from '../database/seeders/index.js';
import { loadModules } from '../modules/index.js';
import { formatLogTimestamp } from '../utils/datetime.js';
import { loadCommands } from '../commands/index.js';

/**
 * Handles the 'ready' event for the Discord client.
 * @param client The Discord client instance.
 * @param sequelize The Sequelize instance for database operations.
 */
export async function onReady(client: Client, sequelize: Sequelize): Promise<void> {
  console.log(formatLogTimestamp() + `🔄 Ready Event Started! Logged in as ${client.user?.tag}`);

  try {
    await syncModels(sequelize);
    await loadModules(client);
    await loadCommands(client, sequelize, process.env.DISCORD_CLIENT_ID!);

    console.log(formatLogTimestamp() + '☑️  Ready Event processed. Awaiting further interactions');
  } catch (error) {
    console.error(formatLogTimestamp() + '🟥 Error during ready event initialization:', error);
  }
}