import { Client as ZKILLBOT_DISCORD_CLIENT } from 'discord.js';

export async function log(interaction, message) {
	const guildName = interaction.guild ? interaction.guild.name : 'DM';
	const channelName = interaction.channel ? interaction.channel.name : 'DM';
	const userTag = interaction.user ? interaction.user.tag : 'Unknown User';

	console.log(`${guildName} / #${channelName} / ${userTag} : ${message}`);
}

export async function logInteraction(db, interaction, message, options = null, response = null) {
	try {
		const guildId = interaction.guildId || null;
		const channelId = interaction.channelId || null;
		const userId = interaction.user ? interaction.user.id : (interaction.member ? interaction.member.user.id : null);
		
		const guildName = interaction.guild ? interaction.guild.name : 'DM';
		const channelName = interaction.channel ? interaction.channel.name : 'DM';
		const userTag = interaction.user ? interaction.user.tag : 'Unknown User';

		await db.interactionLogs.insertOne({
			guildId,
			channelId,
			userId,
			guildName,
			channelName,
			userTag,
			message, 
			options,
			response,
			createdAt: new Date()
		});
	} catch (err) {
		console.error("interactionLog: Failed to log interaction:", err);
	}
}

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

		await db.channels.deleteMany({ guildId: guildId });
		await db.subsCollection.deleteMany({ guildId: guildId });

		return true;
	} catch (err) {
		console.error(`leaveServer: Failed to leave guild ${guildId}:`, err.message);
		return false;
	}
}
