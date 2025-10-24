import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = false;
export const shouldDefer = false; // Simple response, no external calls

export function command(sub) {
	return sub
		.setName("invite")
		.setDescription("Invite zKillBot to your server");
}

export async function interaction(db, interaction) {
	const inviteUrl = process.env.INVITE;

	log(interaction, '/invite');
	
	return `🔗 Invite me to your server:\n${inviteUrl}`;
}
