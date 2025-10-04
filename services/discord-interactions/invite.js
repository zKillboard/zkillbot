export const requiresManageChannelPermission = false;

export function command(sub) {
	return sub
		.setName("invite")
		.setDescription("Invite zKillBot to your server");
}

export async function interaction(db, interaction) {
	const inviteUrl = process.env.INVITE;
	
	return `🔗 Invite me to your server:\n${inviteUrl}`;
}
