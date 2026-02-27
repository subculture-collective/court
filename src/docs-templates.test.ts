import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('retrospective template includes required sections and filled mock draft', () => {
    const doc = readFileSync(
        join(process.cwd(), 'docs/templates/retrospective-template.md'),
        'utf8',
    );

    assert.match(doc, /## 1\) Metadata/);
    assert.match(doc, /## 3\) Timeline/);
    assert.match(doc, /## 6\) Root cause analysis/);
    assert.match(doc, /Mock incident example draft \(filled\)/);
    assert.match(doc, /stream_connectivity_degraded/);
});

test('technical debt queue defines P0-P3 rubric, effort bands, and seeded draft rows', () => {
    const doc = readFileSync(
        join(process.cwd(), 'docs/templates/technical-debt-queue.md'),
        'utf8',
    );

    assert.match(doc, /\*\*P0\*\*/);
    assert.match(doc, /\*\*P1\*\*/);
    assert.match(doc, /\*\*P2\*\*/);
    assert.match(doc, /\*\*P3\*\*/);
    assert.match(doc, /\*\*XS:\*\*/);
    assert.match(doc, /\*\*XL:\*\*/);
    assert.match(doc, /DEBT-001/);
    assert.match(doc, /DEBT-004/);
});
