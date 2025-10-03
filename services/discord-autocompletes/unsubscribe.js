import { getNames } from "../information.js";

export async function autocomplete(db, interaction) {
	const { guildId, channelId } = interaction;

	try {
		const sub = interaction.options.getSubcommand();
		if (sub === "unsubscribe") {
			const value = interaction.options.getString("filter");

			db.subsCollection.findOne({ guildId, channelId }).then(doc => {
				let entityIds = doc?.entityIds || [];
				getNames(entityIds).then(names => {
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
						interaction.respond(options.filter(opt => opt.name.toLowerCase().includes(value.toLowerCase())).slice(0, 25));
					} else {
						interaction.respond(options.slice(0, 25));
					}
				}).catch(err => {
					console.error("AutoComplete error while trying to fetch entities:", err);
				})
			}).catch(err => {
				console.error("AutoComplete error while trying to fetch subscriptions:", err);
			})
		}
	} catch (err) {
		console.error("AutoComplete error:", err);
	}
}