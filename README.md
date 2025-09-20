# zKillBot

zKillBot is a Discord bot that listens to zKill's RedisQ and will post killmails via webhook to your channel.

<img width="443" height="241" alt="Example Killmail posted by zKillBot on Discord" src="https://github.com/user-attachments/assets/7a8376bf-a444-4d53-b339-fe3eab9fc67c" />

## Configuration

The configuration is quite simple, here is the env.example file:

```
DISCORD_WEBHOOK_URL=
ENTITY_IDS=
REDISQ_URL=https://zkillredisq.stream/listen.php?queueID=
TESTING=false
```

Copy this file to ```.env``` and modify as necessary:

### DISCORD_WEBHOOK_URL

The DISCORD_WEBHOOK_URL is the means that the bot uses to post the killmail to Discord.  To create the webhook, follow Discord's instructions here: https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks

Then add the webhook that you created to your ```.env``` file, example:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/12345678901234567890/abcdefghijklmnopqrstuvwxyz
```

### ENTITY_IDS

The entity_ids are a comma delimited list of entity ids.  To obtain your entity ID go to https://zkillboard.com and search for your character, corporation, or alliance and then go to that webpage.  You can find your entity ID in the browser's URL bar:

<img width="233" height="34" alt="image" src="https://github.com/user-attachments/assets/dbac58cf-2cb3-44b1-9306-f4e9bacc69a5" />

Copy the number to clipboard and then paste it within your ```.env``` file:

```
ENTITY_IDS=1633218082
```

You can add as many as you like as well, for example:

```
ENTITY_IDS=1633218082,434243723,1354830081
```

You can also add a faction ID if you'd like to see those kills.  Support for systems, constellations, and regions will be coming soon (TM).

### REDISQ_URL

This is the URL for RedisQ that the bot will poll to get the killmails.  At the end of the URL is the queueID, you will want to come up with something custom and unique.

```
REDISQ_URL=https://zkillredisq.stream/listen.php?queueID=TotallyUniqueID9876554321
```

### TESTING

This is available to ensure that the bot is both receiving killmails and able to post via webhook to your Discord.  It will listen for and then post any killmails that comes from RedisQ.  I do not recommend leaving this setting active.  To enable TESTING change ```false``` to ```true```.

```
TESTING=true
```

Once you've confirmed that everything works change the ```true``` back to ```false``` or just remove the line.
