import { getInformation, getNames } from "../information.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	try {
		const value = interaction.options.getString("filter");

		const doc = await db.subsCollection.findOne({ guildId, channelId });
		let entityIds = doc?.entityIds || [];

		// Filter out group: prefixes for autocomplete
		entityIds = (entityIds || [])
			.map(id => String(id))                       // ensure all are strings
			.filter(id => !id.startsWith('group:'))      // exclude group-prefixed IDs
			.map(id => Number(id))                       // convert to numbers
			.filter(n => !isNaN(n));                     // keep only valid numbers

		const names = await getNames(db, entityIds);
		const options = [];

		// re-add groups to entityIds for display
		const groupIds = (doc?.entityIds || [])
			.map(id => String(id))                       // ensure all are strings
			.filter(id => id.startsWith('group:'))       // only keep group-prefixed ones
			.map(id => Number(id.slice(6)))              // extract the numeric portion
			.filter(Number.isFinite);                    // ignore invalid or NaN values

		for (const id of groupIds) {
			const group = await getInformation(db, 'group', id);
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