import fs from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from 'postgres';

export async function runMigrations(
    db: Sql,
    migrationsDir = path.resolve(process.cwd(), 'db/migrations'),
): Promise<void> {
    await db`
        CREATE TABLE IF NOT EXISTS court_schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `;

    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const files = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
        .map(entry => entry.name)
        .sort();

    for (const name of files) {
        const [existing] = await db<{ name: string }[]>`
            SELECT name FROM court_schema_migrations
            WHERE name = ${name}
            LIMIT 1
        `;

        if (existing) continue;

        const fullPath = path.join(migrationsDir, name);
        const sqlText = await fs.readFile(fullPath, 'utf8');

        await db.begin(async (tx: any) => {
            await tx.unsafe(sqlText);
            await tx`
                INSERT INTO court_schema_migrations (name)
                VALUES (${name})
            `;
        });
    }
}
