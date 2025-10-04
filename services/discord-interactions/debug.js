export const requiresManageChannelPermission = false;

export function command(sub) {
	return sub
		.setName("debug")
		.setDescription("Obtain information useful for debugging.")
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	return `guildId: ${guildId}\nchannelId: ${channelId}`;
}
