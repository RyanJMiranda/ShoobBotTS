import { Client } from 'discord.js';
import { Sequelize } from 'sequelize';
import { syncModels } from '../database/seeders/index.js';
import { loadModules } from '../modules/index.js';
import { getAllBotCommandsData, loadCommands } from '../commands/index.js';
import { logToConsole } from '../utils/logger.js';
import { handleGuildCreate } from './guildcreate.js';
import { initializeGuildCommandSyncer } from '../utils/guild_commands.js';

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

    const allBotCommandsData = await getAllBotCommandsData();
    const TOKEN = process.env.DISCORD_TOKEN!; // Ensure TOKEN is available here
    /*
    if (allBotCommandsData && allBotCommandsData.length > 0) { 
      handleGuildCreate(client, TOKEN, allBotCommandsData);
      logToConsole('info', 'READY_EVENT_HANDLER', `GuildCreate event handler enabled.`);
      initializeGuildCommandSyncer(client, TOKEN, allBotCommandsData);
      logToConsole('info', 'READY_EVENT_HANDLER', `Guild command syncer initialized.`);
    } else {
      logToConsole('warning', 'READY_EVENT_HANDLER', `No command data loaded. Guild-related command handlers will not register/sync commands.`);
    } */

    logToConsole('process_end', 'READY_EVENT_HANDLER', `Finished Ready Event. Awaiting further interactions.`);
  } catch (error) {
    logToConsole('danger', 'READY_EVENT_HANDLER', `Error During Ready Event initialization: ${error}`);
  }
}