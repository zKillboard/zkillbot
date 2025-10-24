import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = true; // Database deletion operations

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

	log(interaction, '/remove_all_subs');
	return '❌ All subscriptions removed from this channel.';
}