import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../util/constants.js";
import { getNames } from "./information.js";
import { getFirstString, unixtime } from "../util/helpers.js";

export async function handleInteractions(client) {
	// --- interaction handling ---
	client.on("interactionCreate", async (interaction) => {
		const db = interaction.client.db;
		try {
			if (interaction.isAutocomplete()) {
				handleAutoComplete(interaction);
				return;
			}
			if (!interaction.isChatInputCommand()) return;
			if (interaction.commandName !== "zkillbot") return;

			const guildId = interaction.guildId;
			const channelId = interaction.channelId;
			const sub = interaction.options.getSubcommand();

			if (sub === "invite") {
				const inviteUrl = process.env.INVITE;

				await interaction.reply({
					content: `🔗 Invite me to your server:\n${inviteUrl}`,
					flags: 64
				});
			}

			if (sub === "list") {
				const doc = await db.subsCollection.findOne({ guildId, channelId });
				let entityIds = doc?.entityIds || [];

				// 🔑 resolve IDs to names
				const names = await getNames(entityIds);
				let lines = (entityIds || [])
					.map(id => `• ${id} — ${names[id] ?? "Unknown"}`)
					.join("\n");
				if (doc?.iskValue) {
					lines += `\nisk: >= ${doc?.iskValue}`;
				}
				if (doc?.labels && doc?.labels?.length > 0) {
					lines += '\nlabels: ' + doc.labels.join(', ');
				}
				if (lines.length == 0) {
					return interaction.reply({
						content: `📋 You have no subscriptions in this channel`,
						flags: 64
					});
				}

				return interaction.reply({
					content: `📋 Subscriptions in this channel:\n${lines}`,
					flags: 64
				});
			}

			const canManageChannel = interaction.channel
				.permissionsFor(interaction.member)
				.has("ManageChannels");


			if (sub === "check") {
				const channel = interaction.channel;

				const perms = channel.permissionsFor(interaction.guild.members.me);

				const canView = perms?.has("ViewChannel");
				const canSend = perms?.has("SendMessages");
				const canEmbed = perms?.has("EmbedLinks");
				const isTextBased = channel.isTextBased();

				await interaction.reply({
					content: [
						`🔍 Permission check for <#${channel.id}>`,
						`• View Channel: ${canView ? "✅" : "❌ (allow zkillbot#0066 to view channel)"}`,
						`• Send Messages: ${canSend ? "✅" : "❌ (allow zkillbot#0066 to send messages)"}`,
						`• Embed Links: ${canEmbed ? "✅" : "❌ (allow zkillbot#0066 to embed links)"}`,
						`• Text Based Channel: ${isTextBased ? "✅" : "❌ (channel is not a text based channel)"}`,
						`• You do ` + (canManageChannel ? '' : 'not ') + `have permissions to [un]subscribe for this channel`
					].join("\n"),
					flags: 64
				});

				if (canView && canSend && canEmbed && isTextBased && canManageChannel) {
					await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $set: { checked: true } },
						{ upsert: true }
					);
				}
			}

			if (!canManageChannel) {
				return interaction.reply({
					content: "❌ ACCESS DENIED - insufficient permissions ❌",
					flags: 64 // ephemeral
				});
			}

			if (sub === "subscribe") {
				let doc = await db.subsCollection.findOne({ channelId: channelId });
				if (!doc || doc.checked != true) {
					return interaction.reply({
						content: ` 🛑 Before you subscribe, please run **/zkillbot check** to ensure all permissions are set properly for this channel`,
						flags: 64
					});
				}

				let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

				if (valueRaw.startsWith(ISK_PREFIX)) {
					const iskValue = Number(valueRaw.substr(ISK_PREFIX.length));
					if (Number.isNaN(iskValue)) {
						return interaction.reply({
							content: ` ❌ Unable to subscribe... **${valueRaw}** is not a number`,
							flags: 64
						});
					}
					if (iskValue < 100000000) {
						return interaction.reply({
							content: ` ❌ Unable to subscribe... **${valueRaw}** needs to be at least 100 million`,
							flags: 64
						});
					}

					await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $set: { iskValue: iskValue } },
						{ upsert: true }
					);

					return interaction.reply({
						content: `📡 Subscribed killmails having iskValue of at least ${iskValue} to channel`,
						flags: 64
					});
				} else if (valueRaw.startsWith(LABEL_PREFIX)) {
					const label_filter = valueRaw.substr(LABEL_PREFIX.length);
					if (LABEL_FILTERS.indexOf(label_filter) < 0) {
						return interaction.reply({
							content: ` ❌ Unable to subscribe to label **${label_filter}**, it is not one of the following:\n` + LABEL_FILTERS.join(', '),
							flags: 64
						});
					}

					await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $addToSet: { labels: label_filter } },
						{ upsert: true }
					);

					return interaction.reply({
						content: `📡 Subscribed this channel to killmails having label **${label_filter}**`,
						flags: 64
					});
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

							return interaction.reply({
								content: ` ❕Too many results for **${valueRaw}**, pick one by ID or use a more specific query:\n${formatted}`,
								flags: 64
							});
						}

						if (suggestions.length == 0) {
							return interaction.reply({
								content: ` ❌ Unable to subscribe... **${valueRaw}** did not come up with any search results`,
								flags: 64
							});
						}
						entityId = suggestions[0].data.id;
					}

					let names = await getNames([entityId]);
					if (Object.values(names).length === 0) {
						return interaction.reply({
							content: ` ❌ Unable to subscribe... **${valueRaw}** is not a valid entity id`,
							flags: 64
						});
					}
					const name = names[entityId];

					await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $addToSet: { entityIds: entityId } },
						{ upsert: true }
					);

					await db.entities.updateOne(
						{ entity_id: entityId, name: name },
						{ $setOnInsert: { last_updated: unixtime() } },
						{ upsert: true }
					);

					return interaction.reply({
						content: `📡 Subscribed this channel to ${name}`,
						flags: 64
					});
				}
			}

			if (sub === "unsubscribe") {
				let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

				if (valueRaw.startsWith(ISK_PREFIX)) {
					const res = await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $unset: { iskValue: 1 } }
					);

					if (res.modifiedCount > 0) {
						return interaction.reply({
							content: `❌ Unsubscribed this channel from killmails of a minimum isk value`,
							flags: 64
						});
					} else {
						return interaction.reply({
							content: `⚠️ No subscription found for killmails of a minimum isk value`,
							flags: 64
						});
					}
				}

				if (valueRaw.startsWith(LABEL_PREFIX)) {
					const label_filter = valueRaw.substr(LABEL_PREFIX.length);
					const res = await db.subsCollection.updateOne(
						{ guildId, channelId },
						{ $pull: { labels: label_filter } }
					);

					if (res.modifiedCount > 0) {
						return interaction.reply({
							content: `❌ Unsubscribed this channel from label **${label_filter}**`,
							flags: 64
						});
					} else {
						return interaction.reply({
							content: `⚠️ No subscription found for label **${label_filter}**`,
							flags: 64
						});
					}
				}

				const entityId = Number(valueRaw);
				if (Number.isNaN(entityId)) {
					return interaction.reply({
						content: ` ❌ Unable to unsubscribe... **${valueRaw}** is not a number`,
						flags: 64
					});
				}

				const res = await db.subsCollection.updateOne(
					{ guildId, channelId },
					{ $pull: { entityIds: entityId } }
				);

				if (res.modifiedCount > 0) {
					return interaction.reply({
						content: `❌ Unsubscribed this channel from **${entityId}**`,
						flags: 64
					});
				} else {
					return interaction.reply({
						content: `⚠️ No subscription found for **${entityId}**`,
						flags: 64
					});
				}
			}

			if (sub === "remove_all_subs") {
				await db.subsCollection.deleteOne(
					{ guildId, channelId }
				);

				return interaction.reply({
					content: '❌ All subscriptions removed from this channel.  To subscribe please run `/zkillbot check` again',
					flags: 64
				});
			}
		} catch (e) {
			console.error(e);
		}
	});
}

function handleAutoComplete(interaction) {
	const db = interaction.client.db;
	try {
		const sub = interaction.options.getSubcommand();
		if (sub === "unsubscribe") {
			const value = interaction.options.getString("filter");
			const { guildId, channelId } = interaction;
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