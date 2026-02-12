# Debugging Wrong Channel Routing Issue

## Problem Description
Killmails are being posted to the wrong guildId/channelId despite the filter matching correctly.

## How the System Works

### Data Flow
1. **poll-r2.js** polls for new killmails
2. For each killmail, it queries MongoDB for matching subscriptions
3. Each subscription document contains: `{ guildId, channelId, entityIds, labels, iskValue, advanced }`
4. When a match is found, it extracts `channelId` and `guildId` from the matched document
5. These are pushed to `discord_posts_queue` along with the killmail data
6. **discord-post.js** processes the queue and posts to the extracted `channelId`

### The Key Insight
**Multiple subscriptions can match the same killmail!** This is normal and by design.

For example:
- Channel A (guildId: AAA, channelId: CCC1) subscribes to entity 12345
- Channel B (guildId: BBB, channelId: CCC2) subscribes to entity 12345
- When killmail with entity 12345 arrives, **BOTH** subscriptions match
- Killmail gets posted to **BOTH** channels

## Potential Root Causes

### 1. Multiple Subscriptions (NORMAL)
Different channels subscribed to the same entity. This is expected behavior.

### 2. Stale/Orphaned Subscriptions (BUG)
A channel was deleted or the bot was removed from a guild, but the subscription record still exists in MongoDB.

**Detection**: Run `node scripts/check-duplicates.js`

### 3. Duplicate Subscription Records (BUG)
Multiple subscription documents exist for the same guildId+channelId combination. This shouldn't happen due to upsert logic but could occur from race conditions or migration issues.

**Detection**: Run `node scripts/check-duplicates.js`

### 4. Wrong Match Object (BUG)
The `match` object from the database query contains wrong guildId/channelId values. This could happen if:
- Database corruption
- Migration/import error
- Manual database modification

**Detection**: Run `node scripts/check-sent-history.js <channelId>`

## Diagnostic Scripts

### 1. check-duplicates.js
Checks for:
- Duplicate subscription records (same guildId+channelId)
- Entities with multiple subscribers
- Database integrity issues

```bash
node scripts/check-duplicates.js
```

### 2. trace-killmail.js
Simulates the matching logic for a specific killmail ID:
- Shows which subscriptions would match
- Lists all guildId/channelId pairs that would receive the post
- Helps identify if multiple channels are subscribed to the same entity

```bash
node scripts/trace-killmail.js <killmail_id>
```

Example:
```bash
node scripts/trace-killmail.js 119889062
```

### 3. check-sent-history.js
Checks the sentHistory for a specific channel:
- Shows recent posts and which subscription matched
- Detects if wrong subscription data was used
- Identifies mismatches between expected and actual guildId/channelId

```bash
node scripts/check-sent-history.js <channelId>
```

## Code Analysis

### No Variable Mutation
The `match` object is never mutated after being retrieved from MongoDB:
- ✅ No assignments to `match.channelId` or `match.guildId` found
- ✅ Each loop iteration gets a fresh `match` object from the array
- ✅ Queue items are immutable after creation

### Queue Processing
```javascript
// poll-r2.js - pushing to queue
const channelId = match.channelId;
const guildId = match.guildId;
discord_posts_queue.push({ db, match, guildId, channelId, killmail, zkb, colorCode, matchType });

// discord-post.js - processing queue
const { db, match, guildId, channelId, killmail, zkb, colorCode, matchType } = discord_posts_queue.shift();
```

The values are extracted once and preserved through the queue.

### Database Storage
The `match` object is stored in `sentHistory`:
```javascript
await db.sentHistory.insertOne({
    guildId: guildId,
    channelId: channelId,
    killmail_id: killmail.killmail_id,
    createdAt: new Date(),
    match: match,  // <-- Full subscription document stored here
    matchType: matchType
});
```

This allows us to audit which subscription matched and verify if the wrong one was used.

## How to Fix

### For Orphaned Subscriptions
The code already handles this in `discord-post.js`:
```javascript
if (channelErr.status >= 400 && channelErr.status <= 499) {
    await removeSubscriptions(db, channelId);
}
```

When a channel is not found (404) or forbidden (403), subscriptions are removed.

### For Duplicate Subscriptions
Add a unique index to prevent duplicates:
```javascript
await subsCollection.createIndex(
    { guildId: 1, channelId: 1 },
    { unique: true }
);
```

This is already in the codebase in `util/mongo.js`, so duplicates should be prevented.

### For Wrong Data in Database
Query the subscription that's causing issues:
```javascript
await db.subsCollection.findOne({ channelId: "WRONG_CHANNEL_ID" });
```

Check if it contains correct guildId/channelId or if data is corrupted.

## Next Steps

1. Run `check-duplicates.js` to verify database integrity
2. When you see a wrong post, note the killmail ID
3. Run `trace-killmail.js <killmail_id>` to see all matching subscriptions
4. Run `check-sent-history.js <channelId>` to check what was stored in the database
5. Compare the subscription data to understand why the wrong channel matched

## Expected vs Unexpected Behavior

### Expected (Not a Bug)
```
Killmail 123 matches entity 456
- Channel A subscribed to entity 456 → Gets the killmail ✅
- Channel B subscribed to entity 456 → Gets the killmail ✅
```

### Unexpected (Bug)
```
Killmail 123 matches entity 456
- Channel A subscribed to entity 456 → Should get the killmail
- Channel B NOT subscribed to entity 456 → Gets the killmail anyway ❌
```

If Channel B is receiving killmails it shouldn't, check:
1. Does Channel B have a subscription for that entity?
2. Is there an orphaned subscription with Channel B's ID but different entityIds?
3. Is the match object in sentHistory showing the wrong subscription data?
