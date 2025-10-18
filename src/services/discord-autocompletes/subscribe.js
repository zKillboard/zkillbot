import { app_status } from "../../util/app-status.js";
import { ISK_PREFIX, LABEL_PREFIX, SUGGESTION_LABEL_FILTERS, LABEL_FILTERS } from "../../util/constants.js";
import { sleep } from "../../util/helpers.js";

export async function autocomplete(db, interaction) {
	try {
		const { guildId, channelId } = interaction;

		const valueRaw = interaction.options.getString("filter");

		if (valueRaw === '') {
			return interaction.respond([
				{ name: 'C C P Alliance (alliance)', value: `434243723` },
				{ name: 'Eve University', value: `917701062` },
				{ name: `El'Miner (character)`, value: `277137239` },
				{ name: 'Jita (system)', value: `30000142` },
				{ name: 'Sabre (ship)', value: `22456` },
				{ name: 'ISK (>= 1b)', value: 'isk:1000000000' },
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

		let suggestions = [], invalid, invalid_count = 0;
		do {
			invalid = false;
			const res = await fetch(`https://zkillboard.com/cache/1hour/autocomplete/?query=${valueRaw}`);
			let raw = await res.text();
			if (raw.startsWith("<")) { // invalid json response
				invalid = true;
				invalid_count++;
				if (invalid_count >= 5) {
					break; // give up after 5 tries
				}
				await sleep(400);
			} else {
				suggestions = (JSON.parse(raw)).suggestions;
			}
		} while (invalid);

		suggestions = suggestions.filter(
			s => !s.value.includes("(Closed)") && !s.value.includes("(recycled)")
		);

		const choices = suggestions.map(s => ({
			name: `${s.value} (${s.data.type})`, // what shows in the dropdown
			value: s.data.type === "group" ? `group:${s.data.id}` : `${s.data.id}` // handle group IDs
		}));
		await interaction.respond(choices.slice(0, 25));
	} catch (err) {
		console.error("Autocomplete error:", err);
	}
}