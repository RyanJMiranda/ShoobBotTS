import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionsBitField,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  Client,
} from 'discord.js';
import type { ColorResolvable } from 'discord.js';
import { Sequelize } from 'sequelize';
import type { BotCommand } from './index.js';
import { Message } from '../database/models/Message.js';
import { formatLogTimestamp } from '../utils/datetime.js';

const NewMessageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('newmessage')
    .setDescription('Creates a new recurring scheduled message.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel where the message will be sent.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('content')
        .setDescription('The main text content of the message.')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Choose between a plain message or an embed.')
        .setRequired(true)
        .addChoices(
          { name: 'Plain Message', value: 'message' },
          { name: 'Embed Message', value: 'embed' }
        )
    )
    .addNumberOption((option) =>
      option
        .setName('repeat_hours')
        .setDescription('How often to repeat the message, in hours (e.g., 24 for daily).')
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(720)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('The title for the message (e.g., for embeds).')
        .setRequired(false)
        .setMaxLength(255)
    )
    .addStringOption((option) =>
      option
        .setName('color')
        .setDescription('Hex color code for the embed (e.g., #FF0000). Only for embed type.')
        .setRequired(false)
        .setMinLength(7)
        .setMaxLength(7)
    )
    // Add an optional String Option for embed footer text
    .addStringOption((option) =>
      option
        .setName('footer')
        .setDescription('Footer text for the embed. Only for embed type.')
        .setRequired(false)
        .setMaxLength(2048)
    )
    .toJSON(),

  async execute(
    interaction: CommandInteraction,
    client: Client,
    sequelize: Sequelize
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.get('channel', true)?.channel; // Get the Channel object
    const content = interaction.options.get('content', true)?.value as string;
    const title = interaction.options.get('title')?.value as string | undefined;
    const type = interaction.options.get('type', true)?.value as 'message' | 'embed';
    const repeatHours = interaction.options.get('repeat_hours', true)?.value as number;
    const color = interaction.options.get('color')?.value as string | undefined;
    const footer = interaction.options.get('footer')?.value as string | undefined;

    // --- Basic Validation ---
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: 'Invalid channel selected. Please select a text channel within this server.',
      });
      return;
    }

    if (!interaction.guildId) {
      await interaction.editReply({
        content: 'This command can only be used in a server (guild).',
      });
      return;
    }

    // Embed-specific validation
    if (type === 'embed') {
      if (!title) {
        await interaction.editReply({
          content: 'For an embed message, the `title` option is required.',
        });
        return;
      }
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) { // Basic hex color validation
        await interaction.editReply({
          content: 'Invalid hex color code. Please use a format like `#FF0000`.',
        });
        return;
      }
    }

    try {
      const now = new Date();
      // Calculate the first run time for the message
      const nextRun = new Date(now.getTime() + repeatHours * 60 * 60 * 1000);

      // Create a new message record in the database using the Sequelize model
      await Message.create({
        server_id: interaction.guildId,
        channel_id: channel.id,
        message: content,
        message_title: title || (type === 'embed' ? 'Scheduled Embed' : 'Scheduled Message'),
        message_type: type,
        color: color || null,
        footer_text: footer || null,
        repeat_hours: repeatHours,
        times_sent: 0,
        lastRunAt: null, // New messages haven't been sent yet
        nextRunAt: nextRun, // Schedule the first run
        message_active: 1, // Message is active by default
      });

      // --- Provide feedback to the user ---
      let replyContent = `☑️ Scheduled message created successfully!\nIt will repeat every \`${repeatHours} hours\` in ${channel} (${channel.name}).\n**First run scheduled for:** \`${nextRun.toLocaleString()}\` (your local time).`;

      if (type === 'embed') {
        // Prepare a preview embed for the reply
        const embedPreview = new EmbedBuilder()
          .setTitle(title || 'Scheduled Message Preview')
          .setDescription(content)
          .setFooter({ text: footer || 'Scheduled Message' })
          .setTimestamp(now); // Use current time for preview timestamp

        if (color) {
          embedPreview.setColor(color as ColorResolvable);
        } else {
          embedPreview.setColor('#0099ff'); // Default embed color if none provided
        }

        await interaction.editReply({
          content: replyContent,
          embeds: [embedPreview],
        });
      } else {
        await interaction.editReply({ content: replyContent });
      }

      console.log(
        `${formatLogTimestamp()}📢 New scheduled message created by ${interaction.user.tag} (ID: ${interaction.user.id}) in ${interaction.guild?.name || 'DM'} for channel ${channel.name} (ID: ${channel.id}).`
      );
    } catch (error) {
      console.error(`${formatLogTimestamp()}🟥 Error creating new message:`, error);
      console.error(error);
      await interaction.editReply({
        content:
          '❌ There was an error while trying to create the scheduled message. Please check the bot logs.',
      });
    }
  },
};

export default NewMessageCommand;