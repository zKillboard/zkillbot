import { getInformation, getNames } from "../information.js";
import { log } from "../../util/discord.js";
import { ADVANCED_PREFIX } from "../../util/constants.js";

export const requiresManageChannelPermission = false;
export const shouldDefer = true; // Multiple database queries and name resolution

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
	entityIds = entityIds
		.map(id => String(id))                       // ensure it's a string
		.filter(id => !id.startsWith('group:'))      // remove group-prefixed IDs
		.map(id => Number(id))                       // convert the remaining to numbers
		.filter(n => !isNaN(n));                     // keep only valid numbers

	// 🔑 resolve IDs to names
	const names = await getNames(db, entityIds);
	let lines = (entityIds || [])
		.map(id => `• ${id} — ${names[id] ?? "Unknown"}`)
		.join("\n");
	if (doc?.iskValue) {
		lines += `\nIsk: >= ${doc?.iskValue}`;
	}
	if (doc?.labels && doc?.labels?.length > 0) {
		lines += '\nLabels: ' + doc.labels.join(', ');
	}
	if (doc?.advanced) {
		lines += `\nadvanced:${doc.advanced}`;
	}

	// re-add groups to entityIds for display
	const groupIds = (doc?.entityIds || [])
		.map(id => String(id))                       // ensure everything is a string
		.filter(id => id.startsWith('group:'))       // only keep group-prefixed entries
		.map(id => Number(id.slice(6)))              // extract the number part
		.filter(n => !isNaN(n));                     // drop invalid numbers

	for (const id of groupIds) {
		const group = await getInformation(db, 'group', id);
		const name = group?.name || '???';
		lines += `\n• group:${id} — ${name}`;
	}

	if (lines.length == 0) {
		return `📋 You have no subscriptions in this channel`;
	}

	return `📋 Subscriptions in this channel:\n${lines}`;
}
