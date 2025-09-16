// src/bot.ts
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from 'discord.js';
import * as dotenv from 'dotenv';
import { initializeSequelize } from './database/sequelize.js';
import { onReady } from './events/ready.js';
import { logToConsole } from './utils/logger.js';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  logToConsole('danger', 'BOT', 'Environment variable DISCORD_TOKEN is not set.');
  process.exit(1);
}
if (!CLIENT_ID) {
  logToConsole('danger', 'BOT', 'Environment variable DISCORD_CLIENT_ID is not set.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // Required for message content for non-slash commands
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once(Events.ClientReady, async () => {
  try {
    const sequelize = await initializeSequelize();
    await onReady(client, sequelize);

  } catch (error) {
    logToConsole('danger', 'BOT', `FATAL ERROR: Bot failed to initialize during ClientReady event: ${error}`);
    process.exit(1);
  }
});


client.login(TOKEN).catch((error) => {
  logToConsole('danger', 'BOT', `FATAL ERROR: Failed to log in to Discord: ${error}`);
  process.exit(1);
});
logToConsole('process_start', 'BOT', `Bot process started. Awaiting Discord login and ClientReady event...`);