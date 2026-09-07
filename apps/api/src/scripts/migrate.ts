import { MigrationCommand, runMigrationCommand } from '../lib/migrationLedger';

const command = process.argv[2] as MigrationCommand | undefined;
if (!command || !['status', 'verify', 'baseline', 'apply'].includes(command)) {
  console.error('Usage: migrate <status|verify|baseline|apply>');
  process.exitCode = 1;
} else {
  const baselineConfirmed = command === 'baseline'
    && process.argv.includes('--through')
    && process.argv[process.argv.indexOf('--through') + 1] === '008'
    && process.argv.includes('--confirm-baseline');
  runMigrationCommand(command, { baselineConfirmed })
    .then(({ migrations, recorded }) => {
      console.log(`${command}: ${recorded.length}/${migrations.length} migrations recorded`);
    })
    .catch((error: Error) => {
      console.error(`Migration ${command} failed: ${error.message}`);
      process.exitCode = 1;
    });
}