import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentId } from '../types.js';
import { AGENTS } from '../agents.js';

const cache = new Map<AgentId, string[]>();

function transcriptRoot(): string {
    return process.env['TRANSCRIPT_DIR'] ?? './AA-transcripts';
}

function isStageDirection(line: string): boolean {
    return /^\s*\(.*\)\s*$/.test(line);
}

async function load(agentId: AgentId): Promise<string[]> {
    if (cache.has(agentId)) return cache.get(agentId)!;

    const agent = AGENTS[agentId];
    const dir = join(transcriptRoot(), agent.transcriptDir);

    let files: string[];
    try {
        files = await readdir(dir);
    } catch {
        throw new Error(`No transcript directory found for ${agentId} at ${dir}`);
    }

    const txtFiles = files.filter(f => f.endsWith('.txt'));
    if (txtFiles.length === 0) {
        throw new Error(`No transcript files found for ${agentId} in ${dir}`);
    }

    const allLines: string[] = [];
    for (const file of txtFiles) {
        const content = await readFile(join(dir, file), 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length > 0 && !isStageDirection(trimmed)) {
                allLines.push(trimmed);
            }
        }
    }

    cache.set(agentId, allLines);
    return allLines;
}

export async function sample(agentId: AgentId, n: number): Promise<string[]> {
    const lines = await load(agentId);
    if (lines.length === 0) return [];

    const result: string[] = [];
    const used = new Set<number>();
    const max = Math.min(n, lines.length);

    while (result.length < max) {
        const idx = Math.floor(Math.random() * lines.length);
        if (!used.has(idx)) {
            used.add(idx);
            result.push(lines[idx]);
        }
    }
    return result;
}

/** Clear the in-memory cache. Useful for tests. */
export function clearCache(): void {
    cache.clear();
}
