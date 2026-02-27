import type { ModerationReasonCode, ModerationResult } from '../types.js';

interface PatternRule {
    pattern: RegExp;
    reason: ModerationReasonCode;
}

const PATTERN_RULES: PatternRule[] = [
    {
        pattern:
            /\b(n[i1!]gg(?:er|a)|f[a@]gg?(?:ot|it)|k[i1!]ke|sp[i1!]c|ch[i1!]nk|w[e3]tb[a@]ck|r[e3]t[a@]rd)\b/i,
        reason: 'slur',
    },
    {
        pattern:
            /\b(kill\s+(all|every|them|those)|ethnic\s+cleansing|genocide\s+(is|should)|gas\s+the|lynch\s+(them|all))\b/i,
        reason: 'hate_speech',
    },
    {
        pattern:
            /\b(r[a@]pe\s+(her|him|them|you)|mutil[a@]te|dismember|gore\s+porn|snuff)\b/i,
        reason: 'violence',
    },
    {
        pattern:
            /\b(doxx(?:ed|ing)?|swat(?:ted|ting)?|go\s+(?:kill|shoot)\s+(?:your|him|her)self)\b/i,
        reason: 'harassment',
    },
    {
        pattern:
            /\b(c[o0]ck|p[e3]n[i1!]s|v[a@]g[i1!]n[a@]|cum(?:shot)?|orgasm|[a@]n[a@]l\s+s[e3]x)\b/i,
        reason: 'sexual_content',
    },
];

const REDACTED_PLACEHOLDER =
    '[The witness statement has been redacted by the court for decorum violations.]';

export function moderateContent(text: string): ModerationResult {
    const reasons: ModerationReasonCode[] = [];

    for (const rule of PATTERN_RULES) {
        if (rule.pattern.test(text)) {
            if (!reasons.includes(rule.reason)) {
                reasons.push(rule.reason);
            }
        }
    }

    const flagged = reasons.length > 0;

    return {
        flagged,
        reasons,
        original: text,
        sanitized: flagged ? REDACTED_PLACEHOLDER : text,
    };
}
