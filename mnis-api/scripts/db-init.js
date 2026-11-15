/* Runs at build time on the host: applies migrations (or pushes the schema on the very first deploy). */
const { spawnSync } = require('child_process');
const fs = require('fs');
const run = (args) => {
  const r = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
};
if (fs.existsSync('prisma/migrations') && fs.readdirSync('prisma/migrations').length > 0) {
  console.log('> prisma migrate deploy');
  run(['prisma', 'migrate', 'deploy']);
} else {
  console.warn('> No prisma/migrations folder: using `db push` (OK for the first demo deploy only).');
  run(['prisma', 'db', 'push', '--skip-generate']);
}
if (process.env.SEED_ON_DEPLOY === 'true') {
  console.log('> seeding demo data');
  const r = spawnSync('node', ['prisma/seed.js'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
