export const requiresManageChannelPermission = true;

export function command(sub) {
	return sub
		.setName("remove_all_subs")
		.setDescription("Clears all subscriptions in this channel")
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	await db.subsCollection.deleteOne(
		{ guildId, channelId }
	);

	return '❌ All subscriptions removed from this channel.  To subscribe again please run /zkillbot check`';
}