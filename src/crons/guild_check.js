export async function init(db, client) {
	//console.log('Guild Check cron enabled');
	setTimeout(addGuilds.bind(null, db, client), 5555);
	setTimeout(cleanupGuilds.bind(null, db, client), 6666);
}

async function addGuilds(db, client) {
	try {
		const guildIds = [];
		client.guilds.cache.forEach(async guild => {
			await addGuild(db, guild.id);
		});
	} catch (err) {
		console.error(err);
	} finally {
		setTimeout(addGuilds.bind(null, db, client), 66666);
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
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() + 1);

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
			console.log(guild.guildId, 'is inactive - consider purging');
		}
	} catch (err) {
		console.error(err);
	} finally {
		setTimeout(cleanupGuilds.bind(null, db, client), 66666);
	}
}