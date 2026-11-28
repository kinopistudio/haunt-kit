// pnpm verify: runs the solver on every level of both apps, prints a table, exits 1 when an expectation fails.
// The checks live in verify-levels.ts. Vite loads it, so the TypeScript sources and the ?raw spec files
// are read the same way the apps read them.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const started = performance.now();
const root = fileURLToPath(new URL('..', import.meta.url));

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let exitCode = 0;
try {
  const { verify, renderTable } = await server.ssrLoadModule('/scripts/verify-levels.ts');
  const { rows, failures } = verify();
  console.log(renderTable(rows));
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  if (failures.length > 0) {
    console.error(`\nverify: FAILED in ${seconds} s`);
    for (const failure of failures) console.error(`  - ${failure}`);
    exitCode = 1;
  } else {
    console.log(`\nverify: ok, ${rows.length} checks in ${seconds} s`);
  }
} catch (error) {
  console.error('verify: could not run the solver');
  console.error(error);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);
