import { formatLogTimestamp } from "./datetime.js";

/**
 * Formats console logs with timestamps, status emojis, module titles.
 * Example: [9/15/2025 08:21:30 PM] ☑️ [Commands] Command loaded: /newmessage with data
 * @param type keyof Statuses: determines the emoji that's used
 * @param module string: name of the module
 * @param body string: message to log
 * @returns void
 */

type LogType = "success" | "warning" | "danger" | "info" | "process_start" | "process_repeat" | "process_end";

export function logToConsole(
  type: LogType = "success",
  module: string = "Default",
  body: string
): void {
  const statuses: Record<LogType, { emoji: string }> = {
    success: {
      emoji: "🟩",
    },
    warning: {
      emoji: "🟨",
    },
    danger: {
      emoji: "🟥",
    },
    info: {
      emoji: "⬜",
    },
    process_start: {
      emoji: "▶️ ",
    },
    process_repeat: {
        emoji: "🔄",
    },
    process_end: {
      emoji: "☑️ ",
    },
  };

  const emoji = statuses[type].emoji;
  const timestamp = formatLogTimestamp();
  console.log(`${timestamp}${emoji} [${module}] ${body}`);
}