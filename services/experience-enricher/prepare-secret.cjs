// Copies an existing credential into a dedicated direct-connection secret without printing it.
const { spawnSync } = require('node:child_process');
function cloud(args, input) {
  const result = spawnSync('rtk', ['proxy','gcloud',...args,'--project=job-scout-508222','--quiet'],
    { input, encoding:'utf8', windowsHide:true });
  if (result.status !== 0) throw Error('Secret preparation failed');
  return result.stdout.trim();
}
try {
  const url = new URL(cloud(['secrets','versions','access','1','--secret=DB-secret']));
  if (!url.hostname.endsWith('.neon.tech')) throw Error('Unexpected database host');
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('sslmode', 'require');
  cloud(['secrets','create','experience-enricher-database-url','--replication-policy=automatic']);
  cloud(['secrets','versions','add','experience-enricher-database-url','--data-file=-'], url.toString());
  console.log('Dedicated direct-connection secret created');
} catch {
  console.error('Secret preparation failed');
  process.exitCode = 1;
}
