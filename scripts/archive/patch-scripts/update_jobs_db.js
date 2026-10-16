const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DIRECT_URL });
async function run() {
  await client.connect();
  try {
    const cities = ['New York, NY', 'San Francisco, CA', 'Austin, TX', 'Seattle, WA', 'Chicago, IL', 'Boston, MA', 'Denver, CO'];
    const res = await client.query('SELECT id FROM jobs;');
    for(const row of res.rows) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const visa = Math.random() > 0.7;
      await client.query('UPDATE jobs SET location = $1, visa_sponsorship = $2 WHERE id = $3;', [city, visa, row.id]);
    }
    console.log('DB updated successfully');
  } catch(e) {
    console.error(e);
  }
  await client.end();
}
run();
