// src/events/newguild.ts
import { Client, Events, Guild, type ApplicationCommandDataResolvable } from 'discord.js';
import { logToConsole } from '../utils/logger.js';
import { registerCommandsToGuild } from '../utils/guild_commands.js'; // Import our utility

/**
 * Handles the 'guildCreate' event, which fires when the bot joins a new guild.
 * It registers the bot's global commands as guild-specific commands to the new guild.
 *
 * @param client The Discord client instance.
 * @param token The bot's token (needed for the REST API call).
 * @param allCommandsData A list of all global command definitions.
 */
export function handleGuildCreate(
  client: Client,
  token: string,
  allCommandsData: ApplicationCommandDataResolvable[]
): void {
  client.on(Events.GuildCreate, async (guild: Guild) => {
    logToConsole('info', 'EVENT_GUILD_CREATE', `Bot joined new guild: "${guild.name}" (${guild.id})`);

    if (!token) {
      logToConsole('danger', 'EVENT_GUILD_CREATE', `Bot token is missing. Cannot register commands to new guild ${guild.name}.`);
      return;
    }
    if (!client.user?.id) {
      logToConsole('danger', 'EVENT_GUILD_CREATE', `Client ID not available. Cannot register commands to new guild ${guild.name}.`);
      return;
    }
    if (!allCommandsData || allCommandsData.length === 0) {
      logToConsole('warning', 'EVENT_GUILD_CREATE', `No command data available. Skipping command registration for new guild ${guild.name}.`);
      return;
    }

    try {
      await registerCommandsToGuild(client, guild, allCommandsData, token);
    } catch (error) {
      logToConsole('danger', 'EVENT_GUILD_CREATE', `Failed to register commands to new guild "${guild.name}" (${guild.id}): ${error}`);
    }
  });
  logToConsole('process_end', 'EVENT_GUILD_CREATE', `'guildCreate' event listener successfully enabled.`);
}