# Broadcast Integration Setup

> **Phase 3 Feature**: Automated broadcast hooks for OBS, NodeCG, and stream production tools

---

## Overview

Broadcast automation hooks trigger external stream production events based on courtroom phase transitions and moderation actions. Supports stingers, scene switches, and operator alerts with fail-safe error handling.

---

## Supported Providers

### noop (Default)

- **No-operation adapter**
- Logs hook triggers to console
- No external dependencies
- Safe for local development

### obs

- **OBS WebSocket 5.x integration**
- Triggers scene switches and media sources
- Requires OBS Studio with WebSocket plugin
- Production-ready with retry logic

### Future: nodecg, streamelements

- Placeholder for Phase 3+
- Design hooks work with any provider following adapter pattern

---

## Configuration

### Environment Variables

Add to `.env` file:

```bash
# Broadcast provider selection
BROADCAST_PROVIDER=noop  # Options: noop | obs

# OBS WebSocket configuration (if using obs provider)
OBS_WEBSOCKET_URL=ws://localhost:4455
OBS_WEBSOCKET_PASSWORD=your_password_here
```

### .env.example Entry

```bash
# Broadcast Automation (Phase 3)
BROADCAST_PROVIDER=noop
# OBS_WEBSOCKET_URL=ws://localhost:4455
# OBS_WEBSOCKET_PASSWORD=
```

---

## OBS WebSocket Setup

### Prerequisites

1. **OBS Studio** v28.0+ installed
2. **OBS WebSocket plugin** enabled (bundled with OBS 28+)
3. **Network access** between server and OBS instance

### Step 1: Enable WebSocket in OBS

1. Open OBS Studio
2. Go to `Tools → WebSocket Server Settings`
3. Check "Enable WebSocket server"
4. Set port (default: 4455)
5. Set authentication password (recommended for production)
6. Click "Apply" and "OK"

### Step 2: Configure Server

Update `.env`:

```bash
BROADCAST_PROVIDER=obs
OBS_WEBSOCKET_URL=ws://localhost:4455
OBS_WEBSOCKET_PASSWORD=your_password_here
```

### Step 3: Scene Naming Convention

For automatic scene switching, use these scene names in OBS:

- `case_prompt` — Intro/all rise scene
- `verdict_vote` — Voting overlay scene
- `sentence_vote` — Sentence voting scene  
- `final_ruling` — Final judgment scene

**Note**: Scene names are case-sensitive and must match phase names.

### Step 4: Test Connection

1. Start server: `npm run dev`
2. Check logs for: `[broadcast] OBS adapter initialized`
3. Create a session and advance through phases
4. Verify OBS scene switches in logs: `[broadcast:obs] Switching scene: scene=verdict_vote`

---

## Hook Types

### phase_stinger

Triggered on every phase transition.

**Use cases**:

- Play audio stinger when entering verdict voting
- Trigger visual transition effect
- Activate media source for phase announcements

**Payload**:

```typescript
{
  phase: CourtPhase;      // e.g., 'verdict_vote'
  sessionId: string;      // Session UUID
}
```

**OBS Implementation** (future):

- Trigger media source: `stinger_${phase}`
- Or use OBS scene transitions

### scene_switch

Triggered on major phase transitions (verdict_vote, sentence_vote).

**Use cases**:

- Switch to voting overlay scene
- Change camera angles
- Activate poll graphics

**Payload**:

```typescript
{
  sceneName: string;      // e.g., 'verdict_vote'
  phase: CourtPhase;
  sessionId: string;
}
```

**OBS Implementation**:

- `SetCurrentProgramScene` command
- Scene name must exist in OBS

### moderation_alert

Triggered when content moderation flags a turn.

**Use cases**:

- Flash warning indicator to operator
- Log moderation event to external dashboard
- Trigger sound alert

**Payload**:

```typescript
{
  reason: string;         // Moderation reason code
  phase: CourtPhase;
  sessionId: string;
}
```

**OBS Implementation** (future):

- Show/hide text source with warning
- Trigger browser source alert

---

## Event Stream

All broadcast hooks emit telemetry events via SSE:

### broadcast_hook_triggered

**Meaning**: Hook executed successfully

**Payload**:

```json
{
  "hookType": "scene_switch",
  "triggeredAt": "2024-01-15T10:00:00.000Z",
  "phase": "verdict_vote",
  "sceneName": "verdict_vote"
}
```

### broadcast_hook_failed

**Meaning**: Hook failed (network error, OBS offline, etc.)

**Payload**:

```json
{
  "hookType": "scene_switch",
  "error": "Connection refused",
  "failedAt": "2024-01-15T10:00:00.000Z",
  "phase": "verdict_vote"
}
```

---

## Fail-Safe Behavior

### Design Principle

**Broadcast hooks must never block or crash the session.**

### Guarantees

1. ✅ **Non-blocking**: Hooks run asynchronously
2. ✅ **Error isolation**: Hook failures are caught and logged
3. ✅ **Session continuity**: Session advances even if OBS offline
4. ✅ **Telemetry**: All failures emit `broadcast_hook_failed` events
5. ✅ **Latency logging**: Hook execution time logged for debugging

### Example Scenario

```
[10:00:00] Phase transition: verdict_vote
[10:00:00] [broadcast:obs] Switching scene: scene=verdict_vote
[10:00:01] [broadcast:obs] Failed to switch scene: Connection refused
[10:00:01] [broadcast] Hook failed: type=scene_switch latencyMs=1200 error=Connection refused
[10:00:01] Session continues to verdict_vote phase (unaffected)
```

---

## Troubleshooting

### Hook not triggering

**Symptoms**: No `[broadcast:obs]` logs during phase transitions

**Solutions**:

1. Verify `BROADCAST_PROVIDER=obs` in `.env`
2. Check server restart after `.env` changes
3. Review logs for adapter initialization: `[broadcast] OBS adapter selected`
4. Confirm phase transitions are happening (check session logs)

### OBS not responding

**Symptoms**: Logs show `[broadcast:obs] Failed to switch scene`

**Solutions**:

1. Verify OBS WebSocket server is enabled
2. Check OBS WebSocket port (default: 4455)
3. Confirm `OBS_WEBSOCKET_URL` matches OBS settings
4. Test WebSocket connection from terminal:

   ```bash
   wscat -c ws://localhost:4455
   ```

5. Review firewall rules (localhost usually allowed)

### Scene not found

**Symptoms**: OBS logs scene name errors

**Solutions**:

1. Verify scene names match exactly (case-sensitive)
2. Check scene exists in OBS Studio
3. Use OBS Scene Collection export to verify names
4. Restart OBS after creating new scenes

### Performance issues

**Symptoms**: Hooks taking >500ms, session lag

**Solutions**:

1. Check network latency between server and OBS
2. Review OBS resource usage (CPU/GPU)
3. Reduce scene complexity (too many sources)
4. Consider running OBS on same machine as server
5. Monitor `latencyMs` in logs for performance baseline

---

## Advanced Configuration

### Custom Adapter Implementation

To add support for NodeCG, StreamElements, or other tools:

1. **Create adapter file**: `src/broadcast/my-adapter.ts`
2. **Implement interface**:

   ```typescript
   import type { BroadcastAdapter } from './adapter.js';
   
   export class MyAdapter implements BroadcastAdapter {
       readonly provider = 'my-provider';
       
       async triggerPhaseStinger(input: PhaseStingerInput): Promise<void> {
           // Your implementation
       }
       
       async triggerSceneSwitch(input: SceneSwitchInput): Promise<void> {
           // Your implementation
       }
       
       async triggerModerationAlert(input: ModerationAlertInput): Promise<void> {
           // Your implementation
       }
   }
   ```

3. **Register in factory**: Update `createBroadcastAdapterFromEnv()` in `adapter.ts`
4. **Add env config**: Document in `.env.example`

---

## Production Deployment

### Checklist

- [ ] OBS WebSocket password set (non-empty, secure)
- [ ] Firewall rules allow server → OBS connection
- [ ] All required scenes exist in OBS
- [ ] Broadcast hooks tested with staging session
- [ ] Monitoring dashboard shows `broadcast_hook_triggered` events
- [ ] Fallback plan if OBS goes offline (session continues, manual operation)

### Monitoring Metrics

Track these events via analytics dashboard:

- `broadcast_hook_triggered` count per session
- `broadcast_hook_failed` count per session  
- Hook latency distribution (p50, p95, p99)
- Hook failure rate percentage

### Incident Response

**If broadcast hooks fail during live session**:

1. Session continues automatically (fail-safe)
2. Operator manually controls OBS scenes
3. Review logs after session for root cause
4. File incident report with `broadcast_hook_failed` events

---

## Future Enhancements

- [ ] NodeCG adapter implementation
- [ ] StreamElements adapter implementation
- [ ] Retry logic with exponential backoff
- [ ] Connection pooling for OBS WebSocket
- [ ] UI for testing hooks without full session
- [ ] Hook preview mode (dry-run)
- [ ] Custom hook scripts via operator config
