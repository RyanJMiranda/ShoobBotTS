// src/utils/guild_commands.ts
import { Client, Guild, REST, Routes } from 'discord.js';
import type { ApplicationCommandDataResolvable } from 'discord.js';
import { logToConsole } from './logger.js';
import { GuildCommand } from '../database/models/GuildCommand.js';
import { calculateChecksum } from './checksum.js';


/**
 * Loops through all guilds the bot is currently cached for and synchronizes
 * their guild-specific slash commands. This function is typically called on bot startup.
 *
 * @param client The Discord client instance.
 * @param token The bot token for REST API.
 * @param allBotCommandsData A list of all command definitions (global commands to sync to guilds).
 */
export async function initializeGuildCommandSyncer(
  client: Client,
  token: string,
  allBotCommandsData: ApplicationCommandDataResolvable[]
): Promise<void> {
  logToConsole('process_start', 'GUILD_COMMAND_SYNC', `Initializing guild command synchronizer.`);

  if (!token) {
    logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Bot token is missing. Guild command synchronization will not run.`);
    return;
  }
  if (!client.user?.id) {
    logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Client ID not available. Guild command synchronization will not run.`);
    return;
  }
  if (!allBotCommandsData || allBotCommandsData.length === 0) {
    logToConsole('warning', 'GUILD_COMMANDS_SYNC', `No command data available. Guild command synchronization will not register commands.`);
    return;
  }

  logToConsole('process_start', 'GUILD_COMMAND_SYNC', `Starting command synchronization across all cached guilds.`);

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    await client.guilds.fetch();
    logToConsole('info', 'GUILD_COMMANDS_SYNC', `Fetched ${client.guilds.cache.size} guilds for synchronization.`);
  } catch (fetchError) {
    logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Error fetching guilds for synchronization: ${fetchError}`);
    return;
  }

  const syncPromises = Array.from(client.guilds.cache.values()).map(async (guild) => {
    try {
      const wasSynced = await syncGuildCommands(client, guild, allBotCommandsData, token);
      if (wasSynced) {
        syncedCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      failedCount++;
      logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Unhandled error during sync for guild "${guild.name}" (${guild.id}): ${error}`);
    }
  });

  await Promise.allSettled(syncPromises);

  logToConsole('process_end', 'GUILD_COMMAND_SYNC',
    `Guild command synchronization finished. Synced: ${syncedCount}, Skipped (up-to-date): ${skippedCount}, Failed: ${failedCount}.`
  );
}
/**
 * Registers a given list of slash commands to a specific guild.
 * This effectively overwrites any existing guild-specific commands for the bot in that guild.
 * This function does NOT manage database entries for guild-specific commands.
 *
 * @param client The Discord client instance.
 * @param guild The Guild object where commands should be registered.
 * @param commandsToRegister An array of ApplicationCommandDataResolvable to register.
 * @param token The bot token for REST API.
 */
export async function registerCommandsToGuild(
  client: Client,
  guild: Guild,
  allBotCommandsData: ApplicationCommandDataResolvable[],
  token: string
): Promise<void> {
  logToConsole('process_start', 'GUILD_COMMANDS_REGISTER', `Attempting to register/update commands for guild "${guild.name}" (${guild.id}).`);

  if (!token) {
    logToConsole('danger', 'GUILD_COMMANDS_REGISTER', `Bot token is missing for guild ${guild.id}. Cannot register commands.`);
    return;
  }

  const commandsToRegisterViaAPI: ApplicationCommandDataResolvable[] = [];
  let shouldPerformAPIPut = false;

  for (const commandData of allBotCommandsData) {
    const name = (commandData as any).name;
    const commandDataJson = JSON.stringify(commandData);
    const currentChecksum = calculateChecksum(commandDataJson);

    try {
      const commandDescription = (commandData as any).description === '' ? null : (commandData as any).description || null;
      const [dbGuildCommand, created] = await GuildCommand.findOrCreate({
        where: { name: name, guildId: guild.id },
        defaults: {
          name: name,
          description: commandDescription,
          guildId: guild.id,
          lastUpdated: Math.floor(Date.now() / 1000),
          checksum: currentChecksum,
        }
      });

      const shouldUpdateThisCommand = created || dbGuildCommand.checksum !== currentChecksum;

      if (shouldUpdateThisCommand) {
        logToConsole('process_repeat', 'GUILD_COMMANDS_REGISTER', `/${name} changed (or is new) for guild ${guild.name}. Will trigger guild API update.`);
        shouldPerformAPIPut = true;

        if (!created && dbGuildCommand.checksum !== currentChecksum) {
          await dbGuildCommand.update({
            description: commandDescription,
            lastUpdated: Math.floor(Date.now() / 1000),
            checksum: currentChecksum,
          });
          logToConsole('success', 'GUILD_COMMANDS_REGISTER', `/${name} existing database entry updated for guild ${guild.name}.`);
        } else if (created) {
          logToConsole('success', 'GUILD_COMMANDS_REGISTER', `/${name} new database entry created for guild ${guild.name}.`);
        }
      } else {
        logToConsole('info', 'GUILD_COMMANDS_REGISTER', `/${name} matches checksum for guild ${guild.name} and is up-to-date. `);
      }
      commandsToRegisterViaAPI.push(commandData);
    } catch (error) {
      logToConsole('danger', 'GUILD_COMMANDS_REGISTER', `Error processing /${name} for guild ${guild.name} DB/Checksum check: ${error}`);
      shouldPerformAPIPut = true;
      commandsToRegisterViaAPI.push(commandData);
    }
  }

  if (shouldPerformAPIPut || commandsToRegisterViaAPI.length > 0) {
    const rest = new REST().setToken(token);
    const clientId = client.user?.id;

    if (!clientId) {
      logToConsole('danger', 'GUILD_COMMANDS_REGISTER', 'Client ID not available. Cannot register commands to guild.');
      return;
    }

    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guild.id),
        { body: commandsToRegisterViaAPI }
      );
      logToConsole('success', 'GUILD_COMMANDS_REGISTER', `Successfully registered ${commandsToRegisterViaAPI.length} commands to guild "${guild.name}" (${guild.id}).`);
    } catch (error) {
      logToConsole('danger', 'GUILD_COMMANDS_REGISTER', `Error registering commands to guild "${guild.name}" (${guild.id}): ${error}`);
      if ((error as any).code === 50001) {
        logToConsole('warning', 'GUILD_COMMANDS_REGISTER', `Bot lacks access to guild ${guild.id} (Missing Access). Cannot register commands.`);
      } else if ((error as any).code === 50013) {
        logToConsole('warning', 'GUILD_COMMANDS_REGISTER', `Bot lacks permissions to manage commands in guild ${guild.id} (Missing Permissions). Cannot register.`);
      }
    }
  } else {
    logToConsole('info', 'GUILD_COMMANDS_REGISTER', `No command changes detected for guild ${guild.name}. Skipping Discord API registration.`);
  }

  logToConsole('process_end', 'GUILD_COMMANDS_REGISTER', `Finished command registration attempt for guild "${guild.name}" (${guild.id}).`);
}

/**
 * Scans a single guild to check if its guild-specific commands are up-to-date
 * with the bot's current command definitions, and re-registers them if necessary.
 *
 * @param client The Discord client instance.
 * @param guild The Guild object to synchronize commands for.
 * @param allBotCommandsData An array of all global command definitions.
 * @param token The bot token for REST API.
 * @returns true if commands were updated, false otherwise.
 */
export async function syncGuildCommands(
  client: Client,
  guild: Guild,
  allBotCommandsData: ApplicationCommandDataResolvable[],
  token: string
): Promise<boolean> {
  logToConsole('process_start', 'GUILD_COMMANDS_SYNC', `Synchronizing commands for guild "${guild.name}" (${guild.id}).`);

  if (!token) {
    logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Bot token is missing for guild ${guild.id}. Cannot sync commands.`);
    return false;
  }

  const commandsToRegisterViaAPI: ApplicationCommandDataResolvable[] = [];
  let shouldPerformAPIPut = false;

  for (const commandData of allBotCommandsData) {
    const name = (commandData as any).name;
    const commandDataJson = JSON.stringify(commandData);
    const currentChecksum = calculateChecksum(commandDataJson);

    try {
      // --- CHANGED: Using findOrCreate ---
      const [dbGuildCommand, created] = await GuildCommand.findOrCreate({
        where: { name: name, guildId: guild.id },
        defaults: {
          name: name,
          description: (commandData as any).description || null, // Use null for optional description
          guildId: guild.id,
          lastUpdated: Math.floor(Date.now() / 1000),
          checksum: currentChecksum,
        }
      });

      const shouldUpdateThisCommand = created || dbGuildCommand.checksum !== currentChecksum;

      if (shouldUpdateThisCommand) {
        logToConsole('process_repeat', 'GUILD_COMMANDS_SYNC', `/${name} changed (or is new) for guild ${guild.name}. Flagging for API update.`);
        shouldPerformAPIPut = true;

        if (!created && dbGuildCommand.checksum !== currentChecksum) {
          await dbGuildCommand.update({
            description: (commandData as any).description || null,
            lastUpdated: Math.floor(Date.now() / 1000),
            checksum: currentChecksum,
          });
          logToConsole('success', 'GUILD_COMMANDS_SYNC', `/${name} existing database entry updated for guild ${guild.name}.`);
        } else if (created) {
          logToConsole('success', 'GUILD_COMMANDS_SYNC', `/${name} new database entry created for guild ${guild.name}.`);
        }
      } else {
        logToConsole('info', 'GUILD_COMMANDS_SYNC', `/${name} matches checksum for guild ${guild.name} and is up-to-date.`);
      }
      commandsToRegisterViaAPI.push(commandData);
    } catch (error) {
      logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Error processing /${name} for guild ${guild.name} DB/Checksum check: ${error}`);
      shouldPerformAPIPut = true;
      commandsToRegisterViaAPI.push(commandData);
    }
  }


  if (shouldPerformAPIPut || commandsToRegisterViaAPI.length > 0) {
    const rest = new REST().setToken(token);
    const clientId = client.user?.id;

    if (!clientId) {
      logToConsole('danger', 'GUILD_COMMANDS_SYNC', 'Client ID not available. Cannot sync commands to guild.');
      return false;
    }

    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guild.id),
        { body: commandsToRegisterViaAPI }
      );
      logToConsole('success', 'GUILD_COMMANDS_SYNC', `Successfully synchronized ${commandsToRegisterViaAPI.length} commands to guild "${guild.name}" (${guild.id}).`);
      logToConsole('process_end', 'GUILD_COMMANDS_SYNC', `Finished command synchronization for guild "${guild.name}" (${guild.id}).`);
      return true;
    } catch (error) {
      logToConsole('danger', 'GUILD_COMMANDS_SYNC', `Error synchronizing commands to guild "${guild.name}" (${guild.id}): ${error}`);
      if ((error as any).code === 50001) {
        logToConsole('warning', 'GUILD_COMMANDS_SYNC', `Bot lacks access to guild ${guild.id} (Missing Access). Cannot sync commands.`);
      } else if ((error as any).code === 50013) {
        logToConsole('warning', 'GUILD_COMMANDS_SYNC', `Bot lacks permissions to manage commands in guild ${guild.id} (Missing Permissions). Cannot sync.`);
      }
      logToConsole('process_end', 'GUILD_COMMANDS_SYNC', `Finished command synchronization for guild "${guild.name}" (${guild.id}) with errors.`);
      return false;
    }
  } else {
    logToConsole('info', 'GUILD_COMMANDS_SYNC', `No command changes detected for guild ${guild.name}. Skipping Discord API synchronization.`);
    logToConsole('process_end', 'GUILD_COMMANDS_SYNC', `Finished command synchronization for guild "${guild.name}" (${guild.id}).`);
    return false;
  }
}

/**
 * Clears all existing guild-specific slash commands for the bot in a given guild.
 * It also removes corresponding entries from the database where guildId matches.
 *
 * @param client The Discord client instance.
 * @param guildId The ID of the guild to clear commands from.
 */
export async function clearGuildCommands(
  client: Client,
  guildId: string,
  token: string // Pass the bot token for REST API
): Promise<void> {
  logToConsole('process_start', 'GUILD_COMMANDS_CLEANER', `Attempting to clear guild-specific commands for guild ID: ${guildId}`);

  try {
    const guild = await client.guilds.fetch(guildId); // Fetch the guild to ensure it exists and bot is in it
    if (!guild) {
      logToConsole('warning', 'GUILD_COMMANDS_CLEANER', `Guild with ID ${guildId} not found or bot is not in it. Skipping command clear.`);
      return;
    }

    const rest = new REST().setToken(token);
    const clientId = client.user?.id; // The bot's own user ID is the client ID

    if (!clientId) {
        logToConsole('danger', 'GUILD_COMMANDS_CLEANER', 'Client ID not available. Cannot clear guild commands.');
        return;
    }

    // Set an empty array to delete all guild-specific commands for this bot in this guild
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] } as { body: ApplicationCommandDataResolvable[] } // Explicitly type body as array
    );
    await GuildCommand.destroy({ where: { guildId: guildId } });

    logToConsole('success', 'GUILD_COMMANDS_CLEANER', `Successfully cleared all guild commands for guild "${guild.name}" (${guildId}).`);

  } catch (error) {
    logToConsole('danger', 'GUILD_COMMANDS_CLEANER', `Error clearing commands for guild ID ${guildId}: ${error}`);
    if ((error as any).code === 50001) {
      logToConsole('warning', 'GUILD_COMMANDS_CLEANER', `Bot lacks access to guild ${guildId} (Missing Access). Cannot clear commands.`);
    } else if ((error as any).code === 50013) {
      logToConsole('warning', 'GUILD_COMMANDS_CLEANER', `Bot lacks permissions to manage commands in guild ${guildId} (Missing Permissions). Cannot clear.`);
    }
  }
}

/**
 * Clears guild-specific commands from a list of specified guilds.
 *
 * @param client The Discord client instance.
 * @param guildIds An array of guild IDs to clear commands from.
 * @param token The bot token for REST API.
 */
export async function clearMultipleGuildCommands(
  client: Client,
  guildIds: string[],
  token: string
): Promise<void> {
  logToConsole('process_start', 'GUILD_COMMANDS_CLEANER', `Attempting to clear guild-specific commands from ${guildIds.length} guilds.`);
  for (const guildId of guildIds) {
    await clearGuildCommands(client, guildId, token);
  }
  logToConsole('process_end', 'GUILD_COMMANDS_CLEANER', `Finished clearing commands from specified guilds.`);
}

/**
 * Loops through all guilds the bot is currently cached for and clears
 * all guild-specific slash commands for the bot in each of them.
 * It also removes corresponding entries from the database.
 * This is a developer-only utility for a full cleanup.
 *
 * @param client The Discord client instance.
 * @param token The bot token for REST API.
 */
export async function clearAllCachedGuildCommands(
  client: Client,
  token: string
): Promise<void> {
  logToConsole('process_start', 'GUILD_COMMANDS_CLEANER', `Developer-initiated full cleanup: Clearing ALL cached guild-specific commands.`);

  let clearedCount = 0;
  let failedCount = 0;
  const errorDetails: { guildId: string; guildName: string; error: string }[] = [];

  try {
    // Ensure client's guilds cache is populated
    await client.guilds.fetch();
  } catch (fetchError) {
    logToConsole('danger', 'GUILD_COMMANDS_CLEANER', `Error fetching guilds for full cleanup: ${fetchError}`);
    return;
  }

  const guildPromises = Array.from(client.guilds.cache.values()).map(async (guild) => {
    try {
      await clearGuildCommands(client, guild.id, token); // Use our existing utility
      clearedCount++;
    } catch (error) {
      failedCount++;
      errorDetails.push({
        guildId: guild.id,
        guildName: guild.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await Promise.allSettled(guildPromises); // Wait for all clearing operations

  logToConsole('process_end', 'GUILD_COMMANDS_CLEANER',
    `Full cleanup completed. Cleared: ${clearedCount} guilds, Failed: ${failedCount} guilds.`
  );

  if (failedCount > 0) {
    logToConsole('warning', 'GUILD_COMMANDS_CLEANER', `Details of failed guild command clears:`);
    errorDetails.forEach(detail => {
      logToConsole('warning', 'GUILD_COMMANDS_CLEANER', `  - Guild "${detail.guildName}" (${detail.guildId}): ${detail.error}`);
    });
  }
}