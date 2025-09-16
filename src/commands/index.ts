import {
  Client,
  CommandInteraction,
  Events,
  MessageFlags,
  REST,
  Routes
} from 'discord.js';
import type { ApplicationCommandDataResolvable } from 'discord.js';
import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { calculateChecksum } from '../utils/checksum.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { Command } from '../database/models/Command.js';
import { logToConsole } from '../utils/logger.js';

dotenv.config({ quiet: true });

const TOKEN = process.env.DISCORD_TOKEN as string;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BotCommand {
  data: ApplicationCommandDataResolvable;
  execute: (
    interaction: CommandInteraction,
    client: Client,
    sequelize: Sequelize
  ) => Promise<void>;
  cooldown?: number;
  guildId?: string;
}

const loadedCommands = new Map<string, BotCommand>();
let _allBotCommandsData: ApplicationCommandDataResolvable[] | null = null;
let _commandChecksums: Map<string, string> | null = null;


/**
 * Reads all command files, processes their data, and populates the `loadedCommands` map.
 * This function is designed to be called once to get the master list of commands.
 * It caches the results for subsequent calls.
 *
 * @returns An array of all ApplicationCommandDataResolvable objects.
 */
export async function getAllBotCommandsData(): Promise<ApplicationCommandDataResolvable[]> {
  if (_allBotCommandsData && _commandChecksums) {
    return _allBotCommandsData;
  }

  logToConsole('process_start', 'COMMAND_LOADER', 'Initializing command data from files.');

  const commandsDir = path.join(__dirname);
  const commandFiles = (await fs.readdir(commandsDir)).filter((file) =>
    file.endsWith('.ts')
  );

  const currentAllCommands: ApplicationCommandDataResolvable[] = [];
  const currentCommandChecksums = new Map<string, string>();

  for (const file of commandFiles) {
    if (file === 'index.ts') continue;

    const commandName = path.parse(file).name;
    const filePath = path.join(commandsDir, file.replace('.ts', '.js'));
    const fileUrl = pathToFileURL(filePath).href;

    try {
      const commandModule = await import(fileUrl);
      if (
        commandModule.default &&
        (commandModule.default as BotCommand).data &&
        (commandModule.default as BotCommand).execute
      ) {
        const command: BotCommand = commandModule.default;
        loadedCommands.set(commandName, command);

        currentAllCommands.push(command.data);
        const commandDataJson = JSON.stringify(command.data);
        currentCommandChecksums.set(commandName, calculateChecksum(commandDataJson));
        logToConsole('success', 'COMMAND_LOADER', `Command data loaded: /${commandName}`);
      } else {
        logToConsole('warning', 'COMMAND_LOADER', `${file} does not export a valid default command object (missing data or execute). Skipping.`);
      }
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `Error loading command file ${file}: ${error}`);
    }
  }
  logToConsole('process_end', 'COMMAND_LOADER', `All command files processed. ${currentAllCommands.length} commands found.`);

  _allBotCommandsData = currentAllCommands;
  _commandChecksums = currentCommandChecksums;

  return currentAllCommands;
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
  logToConsole('process_start', 'COMMAND_LOADER', 'Starting command loading and registration process.');

  // --- Get all command data ---
  const allCommands = await getAllBotCommandsData();
  const commandChecksums = _commandChecksums!;
  logToConsole('process_start', 'COMMAND_LOADER', `Beginning Global Command Registration Process`);

  let shouldPerformAPIPut: boolean = false;

  for (const commandData of allCommands) {
    const name = (commandData as any).name;
    const currentChecksum = commandChecksums.get(name);

    if (!currentChecksum) {
      logToConsole('danger', 'COMMAND_LOADER', `Checksum not found for command: ${name}. This indicates an internal issue.`);
      shouldPerformAPIPut = true;
      continue;
    }

    try {
      const dbCommand = await Command.findOne({ where: { name: name } });

      const forceRefresh = process.env.FORCE_COMMAND_REFRESH === 'true';

      if (
        !dbCommand ||
        dbCommand.checksum !== currentChecksum || 
        forceRefresh 
      ) {
        logToConsole('process_repeat', 'COMMAND_LOADER', `/${name} changed (or is new/forced). Will trigger global API update.`);
        shouldPerformAPIPut = true;

         const commandAttributes = {
          name: name,
          description: (commandData as any).description || null,
          lastUpdated: Math.floor(Date.now() / 1000), // Unix timestamp
          checksum: currentChecksum,
        };

        if (dbCommand) {
          await dbCommand.update(commandAttributes);
          logToConsole('success', 'COMMAND_LOADER', `/${name} existing global command database entry updated.`);
        } else {
          await Command.create(commandAttributes);
          logToConsole('success', 'COMMAND_LOADER', `/${name} new global command database entry created.`);
        }

      } else {
        logToConsole('info', 'COMMAND_LOADER', `/${name} matches checksum and is up-to-date.`);
      }
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `Error processing /${name} for DB/Checksum check: ${error}`);
      shouldPerformAPIPut = true;
    }
  }

  if (shouldPerformAPIPut) {
    if (!TOKEN || !clientId) {
      logToConsole('danger', 'COMMAND_LOADER', 'DISCORD_TOKEN or CLIENT_ID missing. Cannot perform global command registration.');
      return;
    }
    logToConsole('process_start', 'COMMAND_LOADER', `Performing global command registration via Discord API`);
    const rest = new REST().setToken(TOKEN);
    try {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: allCommands } 
      );
      logToConsole('success', 'COMMAND_LOADER', `Successfully sent ${allCommands.length} global commands to Discord.`);
    } catch (error) {
      logToConsole('danger', 'COMMAND_LOADER', `Error performing global command registration: ${error}`);
    }
    logToConsole('process_end', 'COMMAND_LOADER', `All global command changes made to database and Discord API`);
  } else {
    logToConsole('process_end', 'COMMAND_LOADER', `No global command changes detected or forced. Skipping Discord API registration.`);
  }

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