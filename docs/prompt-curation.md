# Prompt Curation Guidelines

> **Phase 3 Feature**: Genre rotation and curated prompt bank for varied courtroom cases

---

## Overview

The JuryRigged prompt bank provides a curated collection of case prompts organized by genre tags. The system automatically rotates through genres to avoid repetition and maintain audience engagement.

## Genre Taxonomy

### absurd_civil

Civil cases involving ridiculous but earnest disputes. Treat absurdity with legal gravity.

**Characteristics**:

- Plaintiff vs. defendant structure
- Damages and liability as outcomes
- Everyday situations taken to absurd extremes
- Dead-serious legal treatment of silly claims

**Examples**:

- Neighbor suing over parrot's Shakespearean insults
- Food critic suing restaurant for life-changing deliciousness
- Mime suing understudy for breaking sacred silence

**Verdict options**: Liable / Not Liable

---

### cosmic_crime

Criminal cases involving time travel, aliens, magic, or cosmic violations.

**Characteristics**:

**Examples**:

**Verdict options**: Guilty / Not Guilty

---

### workplace_tribunal

**Characteristics**:

- Employee vs. management structure
- Civil tribunal procedures
- HR policies, company culture, workplace horror stories

**Examples**:

- Forced to use Comic Sans in production code repositories
- Cubicle relocated to "inspirational whale sounds meditation zone"

**Verdict options**: Liable / Not Liable

---

### fantasy_court

Medieval/fantasy legal disputes involving dragons, knights, magic, and mythical beings.

**Characteristics**:

- Crown prosecution vs. defense counsel
- Medieval law applied to magical situations
- Reference ancient scrolls and mystical precedents
- Fantasy gravitas and genre-appropriate language

**Examples**:

- Dragon claiming insurance fraud for fire damage (caused by own sneeze)
- Knight suing armor manufacturer for non-dragon-proof plating
- Fairy godmother charged with unlicensed wish-granting

**Verdict options**: Guilty / Not Guilty (or Liable / Not Liable for civil)

---

## Prompt Bank Structure

Each prompt entry includes:

```typescript
{

  id: string;           // Unique identifier (e.g., 'absurd_civil_001')
  genre: GenreTag;      // One of: absurd_civil, cosmic_crime, workplace_tribunal, fantasy_court
  casePrompt: string;   // Full case description (2-3 sentences)
  caseType: CaseType;   // 'criminal' or 'civil'
  active: boolean;      // Whether prompt is available for selection
}

```

**Location**: `src/court/prompt-bank.ts`

---

## Rotation Policy

### Minimum Distance Rule

- **Default**: Genre cannot repeat within 2 sessions
- Example: If "absurd_civil" used in session 100, earliest repeat is session 102
- **Configurable via**: `DEFAULT_ROTATION_CONFIG.minDistance`

### History Tracking

- **Default**: Track last 10 genres used
- **Configurable via**: `DEFAULT_ROTATION_CONFIG.maxHistorySize`

### Depleted Pool Fallback

- If all genres recently used (depleted pool), system allows any genre
- Warning logged: `[prompt-bank] All genres recently used. Allowing any genre.`

---

## Adding New Prompts

1. **Open** `src/court/prompt-bank.ts`
2. **Add entry** to `PROMPT_BANK` array:

   ```typescript
   {
       id: 'cosmic_crime_004',
       genre: 'cosmic_crime',
       casePrompt: 'Your creative case description here.',
       caseType: 'criminal',
       active: true,
   }
   ```

3. **Verify** case prompt is:

   - 2-3 sentences (not too long)
   - PG-13 appropriate (see Clean Courtroom Policy)
   - Specific enough to inspire improvisation
   - Absurd but grounded in concrete details

4. **Restart** server to load new prompts

---

## Clean Courtroom Policy (Safety Screen)

All prompts must comply with:

- ✅ **No slurs or hate speech**
- ✅ **No graphic/sexual violence**
- ✅ **No targeted harassment of real individuals or protected groups**
- ✅ **Keep tone comedic, absurd, and PG-13**
- ✅ **If unsafe territory appears, redirect with judge discipline**

**Safety hook**: `validatePromptForSession()` placeholder exists for future moderation integration.

---

## Genre-Specific Role Variations

Prompts automatically adjust agent role instructions based on genre:

- **Judge role** changes based on genre (e.g., "Intergalactic Judge" for cosmic_crime)
- **Prosecutor/Plaintiff** attorney adapts to genre tone
- **Defense** attorney uses genre-appropriate arguments
- **Witnesses and Bailiff** use standard prompts (genre-agnostic)

**Implementation**: See `GENRE_ROLE_VARIATIONS` in `src/court/personas.ts`

---

## Operator Controls

### View Current Genre

Check session metadata in dashboard or via API:

```bash
GET /api/court/sessions/:id
```

Response includes `metadata.currentGenre`

### View Genre History

Session metadata includes `metadata.genreHistory` (last 10 genres)

### Override Genre Selection

Currently not supported via UI. To force a specific genre:

1. Edit API request body when creating session
2. Or modify `selectNextPrompt()` call in `src/server.ts` (requires code change)

---

## Troubleshooting

### Same genre appearing twice in a row

- Check `minDistance` configuration
- Verify genre history is persisting correctly in database
- Review recent session metadata for `genreHistory` array

### Prompt bank showing no available prompts

- Ensure at least one prompt has `active: true`
- Check database connection (genre history fetch might be failing)
- Review server logs for `[prompt-bank]` warnings

### Genre not matching expected tone

- Verify `GENRE_ROLE_VARIATIONS` in `personas.ts` includes correct genre tag
- Check that `buildCourtSystemPrompt()` is receiving genre parameter
- Review session metadata to confirm `currentGenre` set correctly

---

## Future Enhancements

- [ ] File-based prompt bank (JSON) with hot-reload
- [ ] Operator UI for activating/deactivating prompts
- [ ] Community-submitted prompt moderation portal (Issue #22 non-goal for Phase 3)
- [ ] ML-based prompt ranking (Issue #22 non-goal for Phase 3)
- [ ] Genre-specific sentence options
- [ ] Multi-genre sessions (blended cases)
