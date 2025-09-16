import {
  Client,
  CommandInteraction,
  Events,
} from 'discord.js';
import type { ApplicationCommandDataResolvable } from 'discord.js';
import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { Command } from '../database/models/Command.js';
import { formatLogTimestamp } from '../utils/datetime.js';

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
  console.log(`${formatLogTimestamp()}🔄 Commands: Starting to load commands from src/commands...`);

  const commandsDir = path.join(__dirname); // This points to src/commands
  const commandFiles = (await fs.readdir(commandsDir)).filter((file) =>
    file.endsWith('.ts')
  );

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

        commandsToRegister.push(command.data);
        const commandDataJson = JSON.stringify(command.data);
        commandChecksums.set(commandName, calculateChecksum(commandDataJson));

        console.log(`${formatLogTimestamp()}🟩 Commands: Command loaded: /${commandName} with data`);
      } else {
        console.warn(
          `${formatLogTimestamp()}🟨 Commands: Command file ${file} does not export a valid default command object (missing data or execute). Skipping.`
        );
      }
    } catch (error) {
      console.error(`${formatLogTimestamp()}🟥 Commands: Error loading command file ${file}:`, error);
      console.error(error);
    }
  }
  console.log(`${formatLogTimestamp()}☑️  Commands: All command files processed.`);

  for (const commandData of commandsToRegister) {
    const name = (commandData as any).name;
    const currentChecksum = commandChecksums.get(name);

    if (!currentChecksum) {
      console.error(`${formatLogTimestamp()}🟥 Commands: Checksum not found for command: ${name}. Skipping registration.`);
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
        console.log(`${formatLogTimestamp()}🔄 Commands: Registering/Updating command: /${name} with Discord...`);
        await client.application?.commands.create(commandData);

        await Command.upsert({
          name: name,
          description: (commandData as any).description || '',
          lastUpdated: Math.floor(Date.now() / 1000), // Unix timestamp
          checksum: currentChecksum,
        });
        console.log(`${formatLogTimestamp()}🟩 Commands: Command /${name} registered/updated in Discord and database.`);
      } else {
        console.log(`${formatLogTimestamp()}⬜ Commands: Command /${name} is up-to-date. Skipping Discord registration.`);
      }
    } catch (error) {
      console.error(`${formatLogTimestamp()}🟥 Commands: Error registering/updating command /${name}:`, error);
      console.error(error);
    }
  }
  console.log(`${formatLogTimestamp()}☑️  Commands: All command registration attempts complete.`);

  client.on(Events.InteractionCreate, async (interaction) => {
    // Only process slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = loadedCommands.get(interaction.commandName);

    if (!command) {
      console.error(`${formatLogTimestamp()}🟥 Commands: No loaded command found for /${interaction.commandName}.`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An unknown command was used!',
          ephemeral: true,
        });
      }
      return;
    }

    try {
      // Execute the command, passing the interaction, client, and sequelize instance
      await command.execute(interaction, client, sequelize);
    } catch (error) {
      console.error(`${formatLogTimestamp()}🟥 Commands: Error executing command /${interaction.commandName}:`, error);
      console.error(error); // Log the full error for more details
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      }
    }
  });
  console.log(`${formatLogTimestamp()}☑️  Commands: Interaction listener for slash commands setup.`);
}