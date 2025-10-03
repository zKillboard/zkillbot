export const requiresManageChannelPermission = true;

export async function interaction(db, interaction) {
	const channel = interaction.channel;

	const perms = channel.permissionsFor(interaction.guild.members.me);

	const canView = perms?.has("ViewChannel");
	const canSend = perms?.has("SendMessages");
	const canEmbed = perms?.has("EmbedLinks");
	const isTextBased = channel.isTextBased();

	if (canView && canSend && canEmbed && isTextBased) {

		const guildId = interaction.guildId;
		const channelId = interaction.channelId;

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $set: { checked: true } },
			{ upsert: true }
		);
	}

	return [
		`🔍 Permission check for <#${channel.id}>`,
		`• View Channel: ${canView ? "✅" : "❌ (allow zkillbot#0066 to view channel)"}`,
		`• Send Messages: ${canSend ? "✅" : "❌ (allow zkillbot#0066 to send messages)"}`,
		`• Embed Links: ${canEmbed ? "✅" : "❌ (allow zkillbot#0066 to embed links)"}`,
		`• Text Based Channel: ${isTextBased ? "✅" : "❌ (channel is not a text based channel)"}`,
		`• You have permissions to [un]subscribe for this channel`
	].join("\n");
}