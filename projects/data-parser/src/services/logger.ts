import chalk from "chalk";


export class Logger {

    /**
     * Logs an informational message to the console with a timestamp and color formatting
     *
     * @param messages - The messages to log
     */
    static info (...messages: Array<unknown>): void {
        console.info(this.formatMessage("info"), ...messages);
    }

    /**
     * Logs a warning message to the console with a timestamp and color formatting
     *
     * @param messages - The messages to log
     */
    static warn (...messages: Array<unknown>): void {
        console.warn(this.formatMessage("warn"), ...messages);
    }

    /**
     * Logs an error message to the console with a timestamp and color formatting
     *
     * @param messages - The messages to log
     */
    static error (...messages: Array<unknown>): void {
        console.error(this.formatMessage("error"), ...messages);
    }

    /**
     * Handles formatting the log message with timestamp and color based on log level
     *
     * @param level    - The log level ("info", "warn", "error")
     * @param messages - The messages to log
     * @returns        The formatted log message string
     */
    private static formatMessage (level: string, ...messages: Array<unknown>): string {
        const time = new Date().toLocaleTimeString();

        switch (level.toLowerCase()) {

            case "warn":
                return `[${time}] [${chalk.yellow.bold(level)}] ${chalk.yellow(messages.join(" "))}`;

            case "error":
                return `[${time}] [${chalk.red.bold(level)}] ${chalk.red(messages.join(" "))}`;

            default:
                return `[${time}] [${chalk.blue.bold(level)}] ${chalk.blue(messages.join(" "))}`;
        }
    }
}
