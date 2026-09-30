const { drizzle } = require("drizzle-orm/node-postgres");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool);

async function seed() {
  console.log("Fetching users...");
  const res = await pool.query("SELECT user_id FROM user_profiles");
  const users = res.rows;
  
  console.log(`Found ${users.length} users. Giving them 200 credits...`);
  
  for (const user of users) {
    try {
      // Create wallet
      await pool.query(`
        INSERT INTO wallets (id, user_id, balance, updated_at)
        VALUES (gen_random_uuid(), $1, 200, NOW())
        ON CONFLICT (user_id) DO UPDATE SET balance = 200, updated_at = NOW()
      `, [user.user_id]);
      
      // Record transaction
      await pool.query(`
        INSERT INTO credit_transactions (id, user_id, amount, transaction_type, status, reference_id, created_at)
        VALUES (gen_random_uuid(), $1, 200, 'purchase', 'completed', 'seed_dev', NOW())
      `, [user.user_id]);
      
      console.log(`Seeded credits for user ${user.user_id}`);
    } catch (e) {
      console.error(`Failed to seed user ${user.user_id}:`, e.message);
    }
  }
  
  console.log("Done seeding credits.");
  process.exit(0);
}

seed();
