import { ISK_PREFIX, LABEL_PREFIX, SUGGESTION_LABEL_FILTERS, LABEL_FILTERS } from "../../util/constants.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	const valueRaw = interaction.options.getString("filter");

	if (valueRaw === '') {
		return interaction.respond([
			{ name: 'C C P Alliance (alliance)', value: `434243723` },
			{ name: 'Eve University', value: `917701062` },
			{ name: `El'Miner (character)`, value: `277137239` },
			{ name: 'Jita (system)', value: `30000142` },
			{ name: 'Sabre (ship)', value: `22456` },
			{ name: 'ISK (currency)', value: 'isk:1000000000' },
			{ name: 'Highsec', value: 'label:loc:highsec' },
			{ name: 'Big ISK - Killmails valued over 10b ISK', value: 'label:bigisk' },
		]);
	}

	if (valueRaw.startsWith(ISK_PREFIX)) {
		return interaction.respond([
			{ name: '100 million ISK', value: `isk:100000000` },
			{ name: '1 billion ISK', value: `isk:1000000000` },
			{ name: '10 billion ISK', value: `isk:10000000000` },
			{ name: '25 billion ISK', value: `isk:25000000000` },
			{ name: '50 billion ISK', value: `isk:50000000000` },
			{ name: '100 billion ISK', value: `isk:100000000000` },
			{ name: '1 trillion ISK', value: `isk:1000000000000` },
		]);
	}

	if (valueRaw.startsWith(LABEL_PREFIX)) {
		// get the prefix they're using, if any
		const label_filter = valueRaw.slice(LABEL_PREFIX.length).trim().toLowerCase();
		const filtered = label_filter.trim().length == 0 ? SUGGESTION_LABEL_FILTERS : LABEL_FILTERS.filter(l => l.startsWith(label_filter));
		const choices = filtered.map(l => ({
			name: l,
			value: `label:${l}`
		}));
		return interaction.respond(choices.slice(0, 25));
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