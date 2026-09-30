const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query('ALTER TABLE jobs RENAME COLUMN recruiter_id TO source_service;');
    console.log('Renamed recruiter_id');
  } catch(e) { console.log(e.message); }

  try {
    await client.query('ALTER TABLE jobs RENAME COLUMN title TO job_role_title;');
    console.log('Renamed title');
  } catch(e) { console.log(e.message); }

  try {
    await client.query('ALTER TABLE jobs RENAME COLUMN description TO job_description;');
    console.log('Renamed description');
  } catch(e) { console.log(e.message); }

  try {
    await client.query('ALTER TABLE jobs ALTER COLUMN is_external SET DEFAULT true;');
    console.log('Updated is_external default');
  } catch(e) { console.log(e.message); }

  try {
    await client.query("ALTER TABLE jobs ALTER COLUMN external_apply_url SET DEFAULT 'https://google.com';");
    console.log('Updated external_apply_url default');
  } catch(e) { console.log(e.message); }

  try {
    await client.query("UPDATE jobs SET is_external = true, external_apply_url = 'https://google.com' WHERE external_apply_url IS NULL OR external_apply_url = '';");
    console.log('Updated existing rows with new defaults');
  } catch(e) { console.log(e.message); }

  await client.end();
  console.log('Done SQL');
}

run();
