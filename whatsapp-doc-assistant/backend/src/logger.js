// A dependency-free structured-ish logger. Timestamps + level tags, nothing more.
// Swap for pino/winston before shipping if you want real log aggregation.

function stamp() {
  return new Date().toISOString();
}

function format(level, args) {
  return [`${stamp()} [${level}]`, ...args];
}

export const log = {
  info: (...args) => console.log(...format('info', args)),
  warn: (...args) => console.warn(...format('warn', args)),
  error: (...args) => console.error(...format('error', args)),
  debug: (...args) => {
    if (process.env.DEBUG) console.log(...format('debug', args));
  },
};
