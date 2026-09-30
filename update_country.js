const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DIRECT_URL });
async function run() {
  await client.connect();
  try {
    await client.query("UPDATE jobs SET country_id = 'a1db6c16-6fc2-4bb8-809d-ee752c2a2573';");
    console.log('Update successful');
  } catch(e) {
    console.log(e.message);
  }
  await client.end();
}
run();
