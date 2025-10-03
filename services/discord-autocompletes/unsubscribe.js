import { getNames } from "../information.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	try {
		const value = interaction.options.getString("filter");

		const doc = await db.subsCollection.findOne({ guildId, channelId });
		let entityIds = doc?.entityIds || [];

		const names = await getNames(entityIds);
		const options = [];

		for (const id in names) {
			options.push({ name: `${id}:${names[id]}`, value: `${id}` });
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