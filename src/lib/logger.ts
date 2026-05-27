/**
 * VUKA — Structured Logger
 * Emits JSON lines in production, pretty-prints in development.
 * Every log line carries: level, timestamp, service, traceId, message, and optional data.
 * Import and use instead of console.log throughout the codebase.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  traceId?: string;
  userId?: string;
  artistId?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const isProd = process.env.NODE_ENV === 'production';
const SERVICE = process.env.LOG_SERVICE ?? 'vuka-api';

function emit(level: LogLevel, message: string, ctx: LogContext = {}) {
  const entry = {
    level,
    ts: new Date().toISOString(),
    service: SERVICE,
    message,
    ...ctx,
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else if (isProd) {
    process.stdout.write(line + '\n');
  } else {
    // Dev: colour-coded console
    const colours: Record<LogLevel, string> = {
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const prefix = `${colours[level]}[${level.toUpperCase()}]${reset}`;
    // eslint-disable-next-line no-console
    console.log(`${prefix} ${message}`, Object.keys(ctx).length ? ctx : '');
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),

  /** Log request start/end with duration. Returns a `done(status)` helper. */
  request(method: string, path: string, traceId: string, userId?: string) {
    const start = Date.now();
    emit('info', 'request', { traceId, method, route: path, userId });
    return (status: number) => {
      emit('info', 'response', {
        traceId, method, route: path, userId,
        status, durationMs: Date.now() - start,
      });
    };
  },
};
