import { execSync, type ExecSyncOptions } from 'node:child_process';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://thoughtfull:thoughtfull@localhost:5432/thoughtfull_test';

export default async function globalSetup() {
  const options: ExecSyncOptions = {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: process.cwd(),
  };
  if (process.platform === 'win32') options.shell = 'cmd.exe';
  execSync('npx prisma migrate deploy', options);
}
