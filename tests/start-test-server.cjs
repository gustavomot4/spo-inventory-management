// Always use a fresh temporary database, never the developer's or store's data.
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync, spawn } = require('node:child_process')
const directory = mkdtempSync(join(tmpdir(), 'spo-accessibility-'))
// Prisma 5's Windows schema engine needs the SQLite file to exist first.
writeFileSync(join(directory, 'test.db'), '')
const env = {
  ...process.env,
  DATABASE_URL: `file:${join(directory, 'test.db').replaceAll('\\', '/')}`,
  SESSION_SECRET: 'spo-isolated-e2e-only-secret-not-for-production',
  APP_PIN: '1357',
  NEXT_TELEMETRY_DISABLED: '1',
}
const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env, stdio: 'inherit' })
if (migration.status !== 0) process.exit(migration.status || 1)
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3100'], { env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', code => process.exit(code || 0))
