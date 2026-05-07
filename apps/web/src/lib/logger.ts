type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
}

const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context !== undefined ? { context } : {}),
  }

  if (level === 'error') {
    console.error(`[${entry.timestamp}] ERROR: ${message}`, context ?? '')
    // TODO: send to Sentry/LogRocket in production
  } else if (level === 'warn') {
    console.warn(`[${entry.timestamp}] WARN: ${message}`, context ?? '')
  } else if (isDev) {
    console.info(`[${entry.timestamp}] ${level.toUpperCase()}: ${message}`, context ?? '')
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    log('debug', message, context)
  },
  info: (message: string, context?: Record<string, unknown>) => {
    log('info', message, context)
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    log('warn', message, context)
  },
  error: (message: string, context?: Record<string, unknown>) => {
    log('error', message, context)
  },
}
