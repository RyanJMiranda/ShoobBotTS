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
import { formatLogTimestamp } from './utils/datetime.js';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error(formatLogTimestamp() + '🟥 Environment variable DISCORD_TOKEN is not set.');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error(formatLogTimestamp() + '🟥 Environment variable DISCORD_CLIENT_ID is not set.');
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
    console.error(formatLogTimestamp() + '🟥 FATAL ERROR: Bot failed to initialize during ClientReady event:', error);
    process.exit(1);
  }
});


client.login(TOKEN).catch((err) => {
  console.error(formatLogTimestamp() + '🟥 FATAL ERROR: Failed to log in to Discord:', err);
  process.exit(1);
});

console.log(formatLogTimestamp() + '🔄 Bot process started. Awaiting Discord login and ClientReady event...');