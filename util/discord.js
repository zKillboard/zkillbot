import { Client as ZKILLBOT_DISCORD_CLIENT } from 'discord.js';

/**
 * Makes the Discord bot leave a specified server.
 * @param {ZKILLBOT_DISCORD_CLIENT} client - The Discord.js client instance.
 * @param {string} guildId - The ID of the guild to leave.
 */
export async function leaveServer(db, client, guildId) {
	try {
		const guild = await client.guilds.fetch(guildId);
		if (!guild) {
			console.log(`leaveServer: Guild ${guildId} not found or not accessible.`);
			return false;
		}

		await guild.leave();
		console.log(`leaveServer: Successfully left guild: ${guild.name} (${guild.id})`);

		await db.subsCollection.deleteMany({ guildId: guildId });

		return true;
	} catch (err) {
		console.error(`leaveServer: Failed to leave guild ${guildId}:`, err.message);
		return false;
	}
}
