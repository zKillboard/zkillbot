import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = false;
export const shouldDefer = false; // Simple response with basic info

export function command(sub) {
	return sub
		.setName("debug")
		.setDescription("Obtain information useful for debugging.")
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	log(interaction, '/debug');

	return `guildId: ${guildId}\nchannelId: ${channelId}`;
}
