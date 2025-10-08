import { Client as ZKILLBOT_DISCORD_CLIENT } from 'discord.js';

export async function check(db, interaction) {
	const channel = interaction.channel;

	const perms = channel.permissionsFor(interaction.guild.members.me);

	const canView = perms?.has("ViewChannel");
	const canSend = perms?.has("SendMessages");
	const canEmbed = perms?.has("EmbedLinks");
	const isTextBased = channel.isTextBased();

	let successfulCheck = false;
	if (canView && canSend && canEmbed && isTextBased) {
		successfulCheck = true;
		const guildId = interaction.guildId;
		const channelId = interaction.channelId;

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $set: { checked: true } },
			{ upsert: true }
		);
	}

	log(interaction, '/check');

	return {
		successfulCheck,
		msg:
			[`🔍 Permission check for <#${channel.id}>`,
			`• View Channel: ${canView ? "✅" : "❌ (allow zkillbot#0066 to view channel)"}`,
			`• Send Messages: ${canSend ? "✅" : "❌ (allow zkillbot#0066 to send messages)"}`,
			`• Embed Links: ${canEmbed ? "✅" : "❌ (allow zkillbot#0066 to embed links)"}`,
			`• Text Based Channel: ${isTextBased ? "✅" : "❌ (channel is not a text based channel)"}`,
				`• You have permissions to [un]subscribe for this channel`
			].join("\n")
	}
}

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
		await db.guilds.deleteMany({ guildId: guildId });

		return true;
	} catch (err) {
		console.error(`leaveServer: Failed to leave guild ${guildId}:`, err.message);
		return false;
	}
}
