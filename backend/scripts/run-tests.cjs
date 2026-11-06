const { spawnSync } = require('child_process');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://thoughtfull:thoughtfull@localhost:5432/thoughtfull_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-not-for-production';
process.env.NODE_ENV = 'test';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['vitest', 'run']);
