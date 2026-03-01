import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS, AGENTS } from '../agents.js';
import { assignCourtRoles, participantsFromRoleAssignments } from './roles.js';

describe('assignCourtRoles (auto-cast)', () => {
    it('returns exactly one judge, prosecutor, defense, bailiff', () => {
        const ra = assignCourtRoles();
        assert.ok(ra.judge);
        assert.ok(ra.prosecutor);
        assert.ok(ra.defense);
        assert.ok(ra.bailiff);
    });

    it('returns 1-3 witnesses', () => {
        const ra = assignCourtRoles();
        assert.ok(ra.witnesses.length >= 1 && ra.witnesses.length <= 3);
    });

    it('assigns no character to more than one role', () => {
        const ra = assignCourtRoles();
        const all = participantsFromRoleAssignments(ra);
        const unique = new Set(all);
        assert.equal(unique.size, all.length, 'duplicate character assigned to multiple roles');
    });

    it('judge comes from judge archetype pool', () => {
        const ra = assignCourtRoles();
        const judgePool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('judge'));
        assert.ok(judgePool.includes(ra.judge), `${ra.judge} is not in judge pool`);
    });

    it('prosecutor comes from prosecutor archetype pool', () => {
        const ra = assignCourtRoles();
        const pool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('prosecutor'));
        assert.ok(pool.includes(ra.prosecutor), `${ra.prosecutor} is not in prosecutor pool`);
    });

    it('witnesses come from witness archetype pool', () => {
        const ra = assignCourtRoles();
        const pool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('witness'));
        for (const w of ra.witnesses) {
            assert.ok(pool.includes(w), `${w} is not in witness pool`);
        }
    });
});

describe('assignCourtRoles (explicit participants override)', () => {
    it('accepts an explicit participant list and assigns roles from it', () => {
        const participants = AGENT_IDS.slice(0, 7);
        const ra = assignCourtRoles(participants);
        const all = participantsFromRoleAssignments(ra);
        assert.ok(all.every(id => participants.includes(id)), 'assigned a character outside the override list');
    });
});

describe('participantsFromRoleAssignments', () => {
    it('returns all assigned characters without duplicates', () => {
        const ra = assignCourtRoles();
        const participants = participantsFromRoleAssignments(ra);
        assert.equal(participants.length, 1 + 1 + 1 + 1 + ra.witnesses.length);
    });
});
