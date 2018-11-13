import { Logger } from './logging';

import { Detector, Models } from 'snowboy';
import record from 'node-record-lpcm16';

import parseArgs from 'minimist';
import toml from 'toml';

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const APP_NAME = 'snowboy-http';

const log = new Logger();

function snowboyPath() {
  let path = require.resolve('snowboy');
  const pos = path.indexOf('/snowboy/');
  if (pos == -1) {
    throw new Error('Unable to determine a path to the Showboy directory');
  }
  return path.slice(0, pos) + '/snowboy';
}

function runAction(act) {
  if (act.type != 'get') {
    throw new Error(`Invalid action: ${act.type}`);
  }
  log.trace(`GET: ${act.url}`);
  try {
    http.get(act.url, (resp) => {
      log.trace(`Status code: ${resp.statusCode}`);
      resp.resume();
    });
  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

function initActions(conf) {
  log.trace(`Loading actions`);
  const actions = {};
  Object.entries(conf).forEach(pair => {
    const name = pair[0];
    if (name == 'general') {
      return;
    }
    const param = pair[1];
    if (!param.action) {
      log.warn('Action is not specified: ${name}');
      return;
    }
    const type = param.action;
    if (type != 'get') {
      throw new Error(`Invalid action: ${type}`);
    }
    const url = param.url;
    if (!url) {
      throw new Error(`URL is not specified: ${name}`);
    }
    log.trace(`${name}: ${url}`);
    actions[name] = {
      type: type,
      url: url
    };
  });
  return actions;
}

function initRecorder(conf) {
  const rec = record.start({
    threshold: 0,
    verbose: false
  });
  return rec;
}

function initDetector(actions, models, conf) {
  log.trace('Initializing detector');
  const audioGain = conf.general.audio_gain || 1.0;
  const applyFrontend = conf.general.apply_frontend || true;
  log.trace(`Audio gain: ${audioGain}
Apply frontend: ${applyFrontend}`);
  const detect = new Detector({
    resource: snowboyPath() + '/resources/common.res',
    models: models,
    audioGain: audioGain,
    applyFrontend: applyFrontend
  });
  detect.on('error', () => {
    log.error(`Detector error`);
  });
/*
  detect.on('silence', () => {
    log.trace('silence');
  });
  detect.on('sound', () => {
    log.trace('sound');
  });
*/
  detect.on('hotword', (index, hotword) => {
    const act = actions[hotword];
    if (act) {
      log.info(`Action: ${hotword}`);
      runAction(act);
    }
  });
  return detect;
}

function initModels(conf) {
  const dir = conf.general.model_dir;
  log.trace(`Models directory: ${path.resolve(dir)}`);
  const models = new Models();
  const files = fs.readdirSync(dir);
  let hasModel = false;
  files.forEach(file => {
    const ext = path.extname(file);
    if (ext != '.umdl' && ext != '.pmdl') {
      return;
    }
    const name = path.basename(file, ext);
    if (!conf[name]) {
      log.warn(`Skipping model: ${file}`);
      return;
    }
    log.trace(`Loading model: ${file}`);
    const sens = conf[name].sensitivity || 0.5;
    log.trace(`Sensitivity: ${sens}`);
    models.add({
      file: `${dir}/${file}`,
      sensitivity: sens,
      hotwords: name
    });
    hasModel = true;
  });
  if (!hasModel) {
    throw new Error('No models found');
  }
  return models;
}

function loadConfigFile(file) {
  log.trace(`Loading config: ${path.resolve(file)}`);
  const s = fs.readFileSync(file, 'utf8');
  return toml.parse(s);
}

async function run() {
  try {
    const args = parseArgs(process.argv.slice(2), {
      string: [ 'c', '_' ],
      boolean: [ 'v', 'h' ],
      alias: {
        'c': 'config',
        'v': 'verbose',
        'h': 'help'
      }
    });
    if (args.help) {
      log.info(`${APP_NAME} [-c <file>] [-v] [-h]

-c, --config: Configuration file
-v, --verbose: Enable verbose mode
-h, --help: Show help message`);
      return;
    }
    log.verbose = args.verbose;
    // Load config file
    let confFile = `${APP_NAME}.conf`; // Default config file
    if (args.config) {
      confFile = args.config;
    }
    const conf = loadConfigFile(confFile);
    if (!conf.general.model_dir) {
      conf.general.model_dir = 'models' // Default models directory
    }
    // Load models
    const models = initModels(conf);
    // Initialize actions
    const actions = initActions(conf);
    // Initialize detector
    const detect = initDetector(actions, models, conf);
    // Initialize recorder
    const rec = initRecorder(conf);
    rec.pipe(detect);
    log.info('Recording audio...');
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

run();
