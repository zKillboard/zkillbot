import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS, ADVANCED_PREFIX } from "../../util/constants.js";
import { getInformation, getNames } from "../information.js";
import { getFirstString, unixtime } from "../../util/helpers.js";
import { log, check } from "../../util/discord.js";
import { parseFilters } from "../../util/filter.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = true; // API calls to zkillboard.com and database operations

export function command(sub) {
	return sub
		.setName("subscribe")
		.setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
		.addStringOption(opt =>
			opt
				.setName("filter")
				.setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
				.setRequired(true)
				.setAutocomplete(true)
		)
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	let doc = await db.subsCollection.findOne({ channelId: channelId });
	if (!doc || doc.checked != true) {
		let result = await check(db, interaction);
		if (!result.successfulCheck) {
			return result.msg;
		}
	}

	let valueRawRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);
	let valueRaw = valueRawRaw.trim().toLowerCase();

	if (valueRaw.startsWith(ISK_PREFIX)) {
		const iskValue = Number(valueRaw.substr(ISK_PREFIX.length));
		if (Number.isNaN(iskValue)) {
			return ` ❌ Unable to subscribe... **${valueRaw}** is not a number`;
		}
		if (iskValue < 100000000) {
			return ` ❌ Unable to subscribe... **${valueRaw}** needs to be at least 100 million`;
		}

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $set: { iskValue: iskValue } },
			{ upsert: true }
		);

		log(interaction, `/subscribe iskValue >= ${iskValue}`)
		return `📡 Subscribed this channel to killmails having iskValue of at least ${iskValue}`;
	} else if (valueRaw.startsWith(LABEL_PREFIX)) {
		const label_filter = valueRaw.slice(LABEL_PREFIX.length).trim().toLowerCase();
		if (LABEL_FILTERS.indexOf(label_filter) < 0) {
			return ` ❌ Unable to subscribe to label **${label_filter}**, it is not one of the following:\n` + LABEL_FILTERS.join(', ');
		}

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $addToSet: { labels: label_filter } },
			{ upsert: true }
		);

		log(interaction, `/subscribe label ${label_filter}`);
		return `📡 Subscribed this channel to killmails having label **${label_filter}**`;
	} else if (valueRaw.startsWith("group:")) { 
		let entityId = Number(valueRaw.slice(6).trim());
		if (Number.isNaN(entityId)) {
			return ` ❌ Unable to subscribe... **${valueRaw}** is not a valid group id`;
		}

		let group = await getInformation(db, 'group', entityId); // ensure it exists in information
		if (!group) {
			return ` ❌ Unable to subscribe... **${valueRaw}** is not a valid group id`;
		}
		const name = group.name || '???';

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $addToSet: { entityIds: `group:${entityId}` } },
			{ upsert: true }
		);

		log(interaction, `/subscribe ${name} (group:${entityId})`);
		return `📡 Subscribed this channel to **${name} (group:${entityId})**`;
	} else if (valueRaw.startsWith(ADVANCED_PREFIX)) {
		const filter = valueRawRaw.slice(ADVANCED_PREFIX.length).trim();

		// Does this channel already have an advanced filter?
		const row = await db.subsCollection.findOne({ guildId, channelId });
		if (row && row.advanced) {
			return ` ❌ Unable to subscribe... this channel already has an advanced filter set. There is a limit of 1 advanced filter per channel. Use \`/list\` to see the current filter(s) or \`/unsubscribe\` first.`;
		}

		// Ensure filter is good
		try {
			parseFilters(filter);
		} catch (ee) {
			return ` ❌ Unable to subscribe... advanced filter is invalid: ${ee.message}`;
		}

		// Filter is valid, save it
		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $set: { advanced: filter } },
			{ upsert: true }
		);

		log(interaction, `/subscribe advanced filter: ${filter}`);
		return `📡 Subscribed this channel with advanced filter:\n\`${filter}\``;
		
	} else {
		let entityId = Number(valueRaw);
		if (Number.isNaN(entityId)) {
			const res = await fetch(`https://zkillboard.com/cache/1hour/autocomplete/?query=${valueRaw}`);
			let suggestions = (await res.json()).suggestions;

			// we will add groups, but omitting for now
			suggestions = suggestions.filter(
				s => !s.value.includes("(Closed)") && s.data.type != "group"
			);

			if (suggestions.length > 1) {
				const formatted = suggestions
					.map(s => `${s.data.id} — ${s.value} (${s.data.type})`)
					.join("\n");

				return ` ❕Too many results for **${valueRaw}**, pick one by ID or use a more specific query:\n${formatted}`;
			}

			if (suggestions.length == 0) {
				return ` ❌ Unable to subscribe... **${valueRaw}** did not come up with any search results`;
			}
			entityId = suggestions[0].data.id;
		}

		let names = await getNames(db, [entityId]);
		if (Object.values(names).length === 0) {
			return ` ❌ Unable to subscribe... **${valueRaw}** is not a valid entity id`;
		}
		const name = names[entityId];

		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $addToSet: { entityIds: entityId } },
			{ upsert: true }
		);

		await db.entities.updateOne(
			{ entity_id: entityId, name: name },
			{
				$setOnInsert: {
					createdAt: new Date()
				}
			},
			{ upsert: true }
		);

		log(interaction, `/subscribe ${name} (${entityId})`);
		return `📡 Subscribed this channel to **${name} (${entityId})**`;
	}
}