import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkTables() {
  const client = await pool.connect();
  try {
    console.log("Checking database tables...\n");

    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("📊 Tables found:");
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Check RSSSource table columns
    if (tablesResult.rows.some((r: any) => r.table_name === 'RSSSource')) {
      console.log("\n🔍 RSSSource table columns:");
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'RSSSource'
        ORDER BY ordinal_position;
      `);
      columnsResult.rows.forEach(row => console.log(`  - ${row.column_name} (${row.data_type})`));
    }

    // Check if we can query RSS sources
    console.log("\n📝 RSS Sources in database:");
    const rssResult = await client.query('SELECT id, name, url FROM "RSSSource" LIMIT 3');
    console.log(`  Found ${rssResult.rows.length} RSS sources`);
    rssResult.rows.forEach((row: any) => console.log(`  - ${row.name}`));

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();
