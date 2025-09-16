import {
  Client,
  CommandInteraction,
  Events,
  MessageFlags
} from 'discord.js';
import type { ApplicationCommandDataResolvable } from 'discord.js';
import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { Command } from '../database/models/Command.js';
import { logToConsole } from '../utils/logger.js';

// ESM equivalent of __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interface for our bot's command structure
export interface BotCommand {
  // Command definition for Discord API (e.g., name, description, options)
  data: ApplicationCommandDataResolvable;
  // The function to execute when the command is called
  // It receives the interaction object, the Discord client, and the Sequelize instance.
  execute: (
    interaction: CommandInteraction,
    client: Client,
    sequelize: Sequelize
  ) => Promise<void>;
  // Optional: Cooldown in seconds for this command
  cooldown?: number;
  // Optional: Guild ID for guild-specific commands (if not global)
  guildId?: string;
}

// A map to store all loaded commands, keyed by command name.
// This allows the interaction listener to quickly find and execute the correct command.
const loadedCommands = new Map<string, BotCommand>();

/**
 * Calculates a simple MD5 checksum of a string.
 * Used to detect changes in command definitions for conditional registration.
 * @param content The string content to hash.
 * @returns The MD5 hash string.
 */
function calculateChecksum(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Loads all command files from the 'src/commands' directory,
 * registers/updates them with Discord's API based on checksums,
 * and sets up a central listener for command interactions.
 *
 * @param client The Discord client instance.
 * @param sequelize The Sequelize instance for database operations.
 * @param clientId The bot's client ID (needed for global command registration).
 */
export async function loadCommands(
  client: Client,
  sequelize: Sequelize,
  clientId: string
): Promise<void> {
  logToConsole('process_start', 'COMMAND_LOADER', 'Reading src/commands to begin loading command files.');

  const commandsDir = path.join(__dirname); // This points to src/commands
  const commandFiles = (await fs.readdir(commandsDir)).filter((file) =>
    file.endsWith('.ts')
  );

  const availableCommands: ApplicationCommandDataResolvable[] = [];
  const commandsToRegister: ApplicationCommandDataResolvable[] = [];
  const commandChecksums = new Map<string, string>();

  for (const file of commandFiles) {
    if (file === 'index.ts') continue;

    const commandName = path.parse(file).name;
    const filePath = path.join(commandsDir, file.replace('.ts', '.js'));
    const fileUrl = pathToFileURL(filePath).href; // Convert to URL for dynamic import

    try {
      const commandModule = await import(fileUrl);
      if (
        commandModule.default &&
        (commandModule.default as BotCommand).data &&
        (commandModule.default as BotCommand).execute
      ) {
        const command: BotCommand = commandModule.default;
        loadedCommands.set(commandName, command);

        availableCommands.push(command.data);
        const commandDataJson = JSON.stringify(command.data);
        commandChecksums.set(commandName, calculateChecksum(commandDataJson));
        logToConsole('success', 'COMMAND_LOADER', `Command loaded: /${commandName} with data`);
      } else {
        logToConsole('warning', 'COMMAND_LOADER', `${file} does not export a valid default command object (missing data or execute). Skipping.`);
      }
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `Error loading command file ${file}: ${error}`);
    }
  }
  logToConsole('process_end', 'COMMAND_LOADER', `All command files processed.`);
  logToConsole('process_start', 'COMMAND_LOADER', `Beginning Command Registration Process`);

  for (const commandData of availableCommands) {
    const name = (commandData as any).name;
    const currentChecksum = commandChecksums.get(name);

    if (!currentChecksum) {
      logToConsole('danger', 'COMMAND_LOADER', `Checksum not found for command: ${name}. Skipping registration.`);
      continue;
    }

    try {
      const dbCommand = await Command.findOne({ where: { name: name } });
      if (
        !dbCommand ||
        dbCommand.checksum !== currentChecksum ||
        (process.env.NODE_ENV === 'development' &&
          process.env.FORCE_COMMAND_REFRESH === 'true')
      ) {
        logToConsole('process_repeat', 'COMMAND_LOADER', `/${name} changed. Adding to command registration list.`);
        await Command.upsert({
          name: name,
          description: (commandData as any).description || '',
          lastUpdated: Math.floor(Date.now() / 1000), // Unix timestamp
          checksum: currentChecksum,
        });
        console.log(commandData);
        commandsToRegister.push(commandData);
        
      } else {
        logToConsole('info', 'COMMAND_LOADER', `/${name} matches checksum and is up-to-date. Skipping Discord Registration.`);
      }
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `${name} could not be registered or updated: ${error}`);
    }
    await client.application?.commands.set(commandsToRegister);
  }
  logToConsole('process_end', 'COMMAND_LOADER', `All Command Registration & Database Update attempts completed.`);

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = loadedCommands.get(interaction.commandName);

    if (!command) {
      logToConsole('danger', 'COMMAND_LOADER', `No loaded command found for /${interaction.commandName}.`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An unknown command was used!',
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    try {
      await command.execute(interaction, client, sequelize);
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `Error executing command /${interaction.commandName}: ${error}`);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'There was an error while executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'There was an error while executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });
  logToConsole('process_end', 'COMMAND_LOADER', `Interaction Listener for Registered Slash Commands Enabled.`);
}