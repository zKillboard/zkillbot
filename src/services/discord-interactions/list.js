import { getInformation, getNames } from "../information.js";
import { log } from "../../util/discord.js";

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

	log(interaction, '/list');

	// pull groups out of entityIds for display
	entityIds = entityIds.filter(id => !id.startsWith('group:')).map(id => Number(id)).filter(Boolean);

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

	// readd groups to entityIds for display
	const groupIds = (doc?.entityIds || []).filter(id => id.startsWith('group:')).map(id => Number(id.slice(6))).filter(Boolean);
	for (const id of groupIds) {
		let group = await getInformation(db, 'group', id);
		const name = group?.name || '???';
		lines += `\n• group:${id} — ${name}`;
	}

	if (lines.length == 0) {
		return `📋 You have no subscriptions in this channel`;
	}

	return `📋 Subscriptions in this channel:\n${lines}`;
}
