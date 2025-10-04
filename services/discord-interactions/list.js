import { getNames } from "../information.js";

export const requiresManageChannelPermission = false;

export function command(sub) {
	return sub
		.setName("list")
		.setDescription("List all subscriptions in this channel")
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	const doc = await db.subsCollection.findOne({ guildId, channelId });
	let entityIds = doc?.entityIds || [];

	// 🔑 resolve IDs to names
	const names = await getNames(db, entityIds);
	let lines = (entityIds || [])
		.map(id => `• ${id} — ${names[id] ?? "Unknown"}`)
		.join("\n");
	if (doc?.iskValue) {
		lines += `\nisk: >= ${doc?.iskValue}`;
	}
	if (doc?.labels && doc?.labels?.length > 0) {
		lines += '\nlabels: ' + doc.labels.join(', ');
	}
	if (lines.length == 0) {
		return `📋 You have no subscriptions in this channel`;
	}

	return `📋 Subscriptions in this channel:\n${lines}`;
}
