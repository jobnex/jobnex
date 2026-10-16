const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DIRECT_URL });
async function run() {
  await client.connect();
  try {
    const res = await client.query('SELECT id FROM jobs;');
    for(const row of res.rows) {
      const exp = Math.floor(Math.random() * 8) + 1;
      await client.query('UPDATE jobs SET experience_required = $1 WHERE id = $2;', [exp, row.id]);
    }
    console.log('Experience updated');
  } catch(e) {
    console.error(e);
  }
  await client.end();
}
run();
