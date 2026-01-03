import { leaveServer } from "../util/discord.js";

let addGuildsIntervalId = null;
let cleanupGuildsIntervalId = null;

export async function init(db, client) {
	//console.log('Guild Check cron enabled');
	addGuildsIntervalId = setTimeout(() => addGuilds(db, client), 5555);
	cleanupGuildsIntervalId = setTimeout(() => cleanupGuilds(db, client), 6666);
}

async function addGuilds(db, client) {
	try {
		client.guilds.cache.forEach(async guild => {
			await addGuild(db, guild.id);
		});
	} catch (err) {
		console.error(err);
	} finally {
		if (addGuildsIntervalId) clearTimeout(addGuildsIntervalId);
		addGuildsIntervalId = setTimeout(() => addGuilds(db, client), 66666);
	}
}

async function addGuild(db, guildId) {
	if (!guildId) return;
	if (!(await db.guilds.findOne({ guildId }))) {
		await db.guilds.updateOne(
			{ guildId }, // match existing
			{
				$setOnInsert: {
					joinedAt: new Date(),
					lastPost: 'never'
				}
			},
			{ upsert: true } // insert only if not found
		);
	}
}

async function cleanupGuilds(db, client) {
	try {
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

		const inactiveGuilds = await db.guilds.find({
			$or: [
				{
					// created ≥ 6 months ago and never posted
					$and: [
						{ joinedAt: { $lte: sixMonthsAgo } },
						{ lastPost: 'never' }
					]
				},
				{
					// last post ≥ 6 months ago
					lastPost: { $lte: sixMonthsAgo }
				}
			]
		}).toArray();
		for (const guild of inactiveGuilds) {
			await leaveServer(db, client, guild.guildId);
			console.log(`cleanupGuilds: Successfully removed ${guild.guildId} for inactivity`);
		}
	} catch (err) {
		console.error(err);
	} finally {
		if (cleanupGuildsIntervalId) clearTimeout(cleanupGuildsIntervalId);
		cleanupGuildsIntervalId = setTimeout(() => cleanupGuilds(db, client), 66666);
	}
}