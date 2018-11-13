import chalk from 'chalk';

import * as util from 'util';

export class Logger {
  constructor() {
    this.verbose = false;
  }

  trace(...args) {
    if (this.verbose) {
      console.log(chalk.dim(util.format(...args)));
    }
  }

  info(...args) {
    console.log(...args);
  }

  warn(...args) {
    console.warn(...args);
  }

  error(...args) {
    console.error(...args);
  }
}

class DummyLogger extends Logger {
  constructor() {
    super();
  }

  trace(...args) {
  }

  info(...args) {
  }

  warn(...args) {
  }

  error(...args) {
  }
}

export function initLogger(log) {
  if (!log) {
    return new DummyLogger();
  }
  return log;
}
