export const requiresManageChannelPermission = false;

export async function interaction(db, interaction) {
	const inviteUrl = process.env.INVITE;
	
	return `🔗 Invite me to your server:\n${inviteUrl}`;
}
