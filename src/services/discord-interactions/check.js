import { check } from "../../util/discord.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = true; // Permission checks and database operations

export function command(sub) {
	return sub
		.setName("check")
		.setDescription("Check if the bot has permission to send messages in this channel")
}

export async function interaction(db, interaction) {
	let result = await check(db, interaction);
	return result.msg;
}