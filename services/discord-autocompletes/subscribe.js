import { getNames } from "../information.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	const valueRaw = interaction.options.getString("filter");

	if (valueRaw === '') {
		return interaction.respond([]);
	}

	const res = await fetch(`https://zkillboard.com/cache/1hour/autocomplete/?query=${valueRaw}`);
	let suggestions = (await res.json()).suggestions;

	// we will add groups, but omitting for now
	suggestions = suggestions.filter(
		s => !s.value.includes("(Closed)") && s.data.type != "group" && !s.value.includes("(recycled)")
	);

	const choices = suggestions.map(s => ({
		name: `${s.value} (${s.data.type})`, // what shows in the dropdown
		value: `${s.data.id}`               // what gets sent back if selected
	}));
	await interaction.respond(choices.slice(0, 25));
}