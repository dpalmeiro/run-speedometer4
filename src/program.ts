import { Command } from 'commander';
import { runCommand } from './commands/run.js';

export const program = new Command();

program
  .name('claudometer')
  .description('Speedometer3 test runner')
  .version('0.1.0');

program.addCommand(runCommand());
