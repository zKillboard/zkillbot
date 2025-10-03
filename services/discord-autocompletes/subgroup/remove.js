import { getNames } from "../../information.js";
import {handleGroupName} from "../../../util/subgroup.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

    const focused = interaction.options.getFocused(true);
    if (focused.name === "group_name") {
        return handleGroupName(db, interaction);
    }
    // TODO: Rewrite using focused option above
	try {
		const value = interaction.options.getString("filter");

		const doc = (await db.subsCollection.findOne({ guildId, channelId })).subgroups[interaction.options.getString("group_name")];
		let entityIds = doc?.entityIds || [];

		const names = await getNames(db, entityIds);
		const options = [];

		for (const id in names) {
            if (id === "0") continue;
			options.push({ name: `${id}:${names[id]}`, value: `${id}` });
		}

		const labels = doc?.labels || [];
		for (let label of labels) {
            if (label === "all") continue;
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