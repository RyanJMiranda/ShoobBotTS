// src/modules/repeater.ts
import { Client, TextChannel, EmbedBuilder, type ColorResolvable } from 'discord.js';
import { Message } from '../database/models/Message.js';
import { formatLogTimestamp } from '../utils/datetime.js';
import { Op } from 'sequelize';
import cron from 'node-cron';

const CRON_SCHEDULE = '* * * * *'; // Every minute

/**
 * The Repeater Module initializes the recurring message sending logic.
 * This function is designed to be called by the `loadModules` system.
 */
export default async function (client: Client): Promise<void> {
  console.log(formatLogTimestamp() + '🔄 Repeater Module: Initializing scheduled message service...');

  // Start the cron job
  cron.schedule(CRON_SCHEDULE, async () => {
    await sendScheduledMessages(client);
  });

  console.log(formatLogTimestamp() + `🟩 Repeater Module: Scheduled message service started with cron job: "${CRON_SCHEDULE}".`);
}

/**
 * Queries for active messages ready to be sent and dispatches them.
 * @param client The Discord client instance.
 */
async function sendScheduledMessages(client: Client): Promise<void> {
  console.log(formatLogTimestamp() + '🔄 Repeater Module: Checking for messages to send...');

  try {
    const now = new Date();

    const messagesToSend = await Message.findAll({
      where: {
        message_active: 1,
        [Op.or]: [
          { nextRunAt: { [Op.lte]: now } },
          { nextRunAt: null },
        ],
      },
      order: [['nextRunAt', 'ASC']],
    });

    if (messagesToSend.length === 0) {
      console.log(formatLogTimestamp() + '🟨 Repeater Module: Found no messages to send.');
      return;
    }

    console.log(formatLogTimestamp() + `🟩 Repeater Module: Found ${messagesToSend.length} message(s) to send.`);

    for (const messageRecord of messagesToSend) {
      const channel = await client.channels.fetch(messageRecord.channel_id);

      if (!channel) {
        console.warn(
          formatLogTimestamp() + `🟨 Repeater Module: Channel ${messageRecord.channel_id} not found for message ID ${messageRecord.id}. Skipping.`
        );
        messageRecord.update({ message_active: 0 });
        continue;
      }

      if (!channel.isTextBased()) {
        console.warn(
          formatLogTimestamp() + `🟨 Repeater Module: Channel ${messageRecord.channel_id} is not a text channel for message ID ${messageRecord.id}. Skipping.`
        );
        messageRecord.update({ message_active: 0 });
        continue;
      }

      try {
        if (messageRecord.message_type === 'embed') {
          const embed = new EmbedBuilder()
            .setTitle(messageRecord.message_title)
            .setDescription(messageRecord.message)
            .setTimestamp(new Date());

          if (messageRecord.color) {
            embed.setColor(messageRecord.color as ColorResolvable);
          }
          if (messageRecord.footer_text) {
            embed.setFooter({ text: messageRecord.footer_text });
          }

          await (channel as TextChannel).send({ embeds: [embed] });
        } else {
          await (channel as TextChannel).send(messageRecord.message);
        }

        console.log(formatLogTimestamp() + `🟩 Repeater Module: Sent message ID ${messageRecord.id} to channel ${messageRecord.channel_id}.`);

        const nextRun = new Date(now.getTime() + messageRecord.repeat_hours * 60 * 60 * 1000);

        await messageRecord.update({
          times_sent: messageRecord.times_sent + 1,
          lastRunAt: new Date(now.getTime()),
          nextRunAt: nextRun
        });

      } catch (error) {
        console.error(
          formatLogTimestamp() + `🟥 Repeater Module: Error sending message ID ${messageRecord.id} to channel ${messageRecord.channel_id}:`,
          error
        );
      }
    }
  } catch (dbError) {
    console.error(formatLogTimestamp() + '🟥 Repeater Module: Database error fetching messages:', dbError);
  }
}