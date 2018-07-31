/* @flow */
/* eslint no-console: 0 */

const fs = require('fs');
const { resolve } = require('path');
const commander = require('commander');
const pkg = require('./package.json');
const generate = require('./index.js');

commander
  .version(pkg.version)
  .arguments('<file>')
  .option('-o, --output <file>', 'The path to output the types to')
  .option(
    '-x, --extension <ext>',
    'Instead of an output, append <ext> to the input file.',
  )
  .description('By default, output is written to stdout.')
  .parse(process.argv);

if (commander.args.length === 0) {
  console.error('You must pass in a file as input');
  process.exit(1);
}

if (commander.extension && commander.output) {
  console.error(
    'Too many options. You can pass either an output *or* an extension.',
  );
  process.exit(1);
}

const file = resolve(commander.args[0]);

try {
  fs.statSync(file);
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`The file \`${file}\` could not be found.`);
  } else {
    console.error(`Unexpected Error:`, e);
  }
  process.exit(1);
}

function getOutput() {
  if (commander.output) {
    return commander.output;
  }
  if (commander.extension) {
    const ext = commander.extension.replace(/^\./, '');
    return `${file}.${ext}`;
  }
  return null;
}

try {
  generate(file, getOutput());
  process.exit(0);
} catch (e) {
  console.error(
    "Couldn't generate the types. Are you sure that's the right file?",
  );
  console.error(e);
  process.exit(1);
}
