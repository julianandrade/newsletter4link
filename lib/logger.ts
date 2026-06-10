/**
 * Structured JSON logger (zero-dependency).
 *
 * Emits a single-line JSON object per log call so that downstream log
 * aggregators (Vercel, CloudWatch, etc.) can parse entries reliably.
 *
 * This is intentionally the single choke point for application logging:
 * to ship logs to Sentry/Datadog/etc. later, add a transport here (e.g.
 * forward `entry` to the provider SDK inside `emit`) rather than sprinkling
 * provider calls across the codebase.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = Record<string, unknown>;

const isProduction = process.env.NODE_ENV === "production";

function serializeError(error: Error): LogContext {
  return {
    error: {
      name: error.name,
      message: error.message,
      // Stack traces can leak internal paths — only include outside production.
      ...(isProduction ? {} : { stack: error.stack }),
    },
  };
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // TODO: forward `entry` to a Sentry/Datadog transport here when configured.

  const line = isProduction
    ? JSON.stringify(entry)
    : JSON.stringify(entry, null, 2);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
      break;
  }
}

export const logger = {
  info(message: string, context?: LogContext): void {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit("warn", message, context);
  },
  debug(message: string, context?: LogContext): void {
    emit("debug", message, context);
  },
  /**
   * Logs an error. Accepts an optional Error (serialized to name/message,
   * plus stack outside production) and/or additional structured context.
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    const errorContext =
      error instanceof Error
        ? serializeError(error)
        : error !== undefined
          ? { error }
          : {};
    emit("error", message, { ...errorContext, ...context });
  },
};
