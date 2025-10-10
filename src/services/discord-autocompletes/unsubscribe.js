import { getInformation, getNames } from "../information.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	try {
		const value = interaction.options.getString("filter");

		const doc = await db.subsCollection.findOne({ guildId, channelId });
		let entityIds = doc?.entityIds || [];

		// Filter out group: prefixes for autocomplete
		entityIds = entityIds.filter(id => !id.startsWith('group:')).map(id => Number(id)).filter(Boolean);

		const names = await getNames(db, entityIds);
		const options = [];

		// readd groups to entityIds for display
		const groupIds = (doc?.entityIds || []).filter(id => id.startsWith('group:')).map(id => Number(id.slice(6))).filter(Boolean);
		for (const id of groupIds) {
			let group = await getInformation(db, 'group', id);
			names[`group:${id}`] = group?.name || '???';
		}

		for (const id in names) {
			options.push({ name: `${names[id]} (${id})`, value: `${id}` });
		}

		const labels = doc?.labels || [];
		for (let label of labels) {
			options.push({ name: `label:${label}`, value: `label:${label}` });
		}

		if (doc?.iskValue) {
			options.push({ name: `isk:${doc.iskValue}`, value: `isk:${doc.iskValue}` });
		}

		if (value) {
			await interaction.respond(
				options.filter(opt => opt.name.toLowerCase().includes(value.toLowerCase())).slice(0, 25)
			);
		} else {
			await interaction.respond(options.slice(0, 25));
		}
	} catch (err) {
		console.error("AutoComplete error:", err);
	}

}