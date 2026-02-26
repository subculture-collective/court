import 'dotenv/config';
import postgres from 'postgres';
import { runMigrations } from '../db/migrations.js';

async function main(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required to run migrations.');
    }

    const db = postgres(databaseUrl, { max: 1 });

    try {
        await runMigrations(db);
        // eslint-disable-next-line no-console
        console.log('Migrations applied successfully.');
    } finally {
        await db.end({ timeout: 5 });
    }
}

main().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
