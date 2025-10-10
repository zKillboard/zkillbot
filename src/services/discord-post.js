import NodeCache from "node-cache";
import { PermissionFlagsBits, urlSafeCharacters } from "discord.js";

import { getNames, fillNames, getSystemDetails } from "./information.js";
import { getIDs } from "../util/helpers.js";
import { app_status } from "../util/app-status.js";
import { client } from "../zkillbot.js";
import { getSystemNameAndRegion } from "./information.js";
import { Db } from "mongodb";

const embeds_cache = new NodeCache({ stdTTL: 30 });
const post_cache = new NodeCache({ stdTTL: 30 });
export const discord_posts_queue = [];

export async function doDiscordPosts(db) {
	try {
		while (discord_posts_queue.length > 0) {
			const { db, match, guildId, channelId, killmail, zkb, colorCode, matchType } = discord_posts_queue.shift();
			let remove = false;

			// ensure we haven't posted this killmail to this channel yet
			try {
				const key = `${channelId}-${killmail.killmail_id}`;
				// check a local cache first to avoid db hits
				if (post_cache.get(key)) {
					continue; // already posted recently
				}

				// check the db in an unobtrusive way
				const existing = await db.sentHistory.findOne({ channelId: channelId, killmail_id: killmail.killmail_id });
				if (existing) {
					post_cache.set(key, true);
					continue; // already posted
				}

				// insert a record to ensure we don't post this killmail to this channel again
				// if this fails with a duplicate key error, we have already posted it before
				await db.sentHistory.insertOne(
					{
						channelId: channelId,
						killmail_id: killmail.killmail_id,
						createdAt: new Date()
					}
				);
				await db.guilds.updateOne(
					{ guildId },
					{
						$set: {
							lastPost: new Date()
						}
					}
				);
				post_cache.set(key, true);
			} catch (err) {
				if (err.code === 11000) {
					// ⚠️ Duplicate key → already sent to this channel
				} else {
					console.error("Insert/send failed:", err);
				}
				continue; // loop without waiting
			}

			let channel;
			try {
				channel = await client.channels.fetch(channelId);
			} catch (channelErr) {
				if ((channelErr.status >= 400 && channelErr.status <= 499) || (channelErr.code == 50001 || channelErr.code == 10003)) {
					console.log(channelErr);
					await removeSubscriptions(db, channelId);
				} else {
					// Something went wrong... keep the error in the logs but don't remove subscriptions just yet
					console.error(`Failed to send embed to ${channelId}:`, channelErr);
				}
			}
			// @ts-ignore
			const guild = channel.guild;
			const locale = guild?.preferredLocale || "en-US";
			let embeds = await getKillmailEmbeds(db, killmail, zkb, locale);

			const config = await db.channels.findOne({ channelId: channelId }) || {};

			// adjust the embeds to their preference
			let cleaned = applyConfigToEmbed(embeds, config);
			postToDiscord(db, channelId, cleaned, colorCode); // lack of await is on purpose

			const matchDoc = {
				match: match,
				channelId: channelId,
				killmail: killmail,
				zkb: zkb,
				match_type: matchType,
				colorCode: colorCode,
				locale: locale,
				createdAt: new Date()
			};
			await db.matches.insertOne(matchDoc)
			break; // break loops, pause for the interval and then start again
		}
	} catch (e) {
		console.error(e);
	} finally {
		setTimeout(doDiscordPosts.bind(null, db), 100);
	}
}

async function getKillmailEmbeds(db, killmail, zkb, locale) {
	const embed_key = `${killmail.killmail_id}-${locale}`;
	let embed = embeds_cache.get(embed_key);
	if (!embed) {
		const url = `https://zkillboard.com/kill/${killmail.killmail_id}/`;

		let final_blow = killmail.attackers[0]; // default to first
		for (let attacker of killmail.attackers) {
			if (attacker.final_blow) {
				final_blow = attacker;
				break;
			}
		}
		const [names] = await Promise.all([
			getNames(db, [...getIDs(killmail.victim), ...getIDs(final_blow)]),
		]);
		const { system, constellation, region } = await getSystemDetails(db, killmail.solar_system_id);

		const victim = fillNames(names, killmail.victim);
		let victim_url = `https://zkillboard.com/character/${victim.character_id}/`;
		let victim_img = `https://images.evetech.net/characters/${victim.character_id}/portrait?size=64`;
		if (!victim.character_name) {
			victim.character_name = victim.corporation_name;
			victim_url = `https://zkillboard.com/corporation/${victim.corporation_id}/`;
			victim_img = `https://images.evetech.net/corporations//${victim.corporation_id}/logo?size=64`;
		}
		const victim_employer = victim.alliance_name ?? victim.corporation_name;

		const fb = fillNames(names, final_blow);
		let fb_img = `https://images.evetech.net/characters/${fb.character_id}/portrait?size=64`;
		if (!fb.character_name) {
			fb.character_name = fb.corporation_name;
			fb_img = `https://images.evetech.net/corporations//${fb.corporation_id}/logo?size=64`;
		}
		if (!fb.character_name) fb.character_name = 'an NPC';
		const fb_employer = fb.alliance_name ?? (fb.corporation_name ?? (fb.faction_name ?? '???'));
		const solo = zkb.labels.indexOf('solo') > -1 ? ', solo, ' : '';
		const attacker_count = killmail.attackers.length - 1;
		const others = attacker_count > 0 ? ' along with ' + attacker_count + ' other ' + (solo.length > 0 ? 'NPC' : 'pilot') + (attacker_count > 1 ? 's' : '') : '';

		const image = `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon`;

		const description = `${victim.character_name} (${victim_employer}) lost their ${victim.ship_type_name} in ${system.name} (${region.name}). Final Blow by ${fb.character_name} (${fb_employer})${solo} in their ${fb.ship_type_name}${others}. Total Value: ${zkb.totalValue.toLocaleString(locale)} ISK`;

		const involved = solo.length > 0 ? 'Solo' : killmail.attackers.length.toLocaleString(locale);

		embed = {
			title: victim.character_name + (victim.character_name.endsWith('s') ? "' " : "'s ") + victim.ship_type_name,
			description: description,
			thumbnail: { url: image, height: 64, width: 64 },
			fields: [
				{ name: "Destroyed", value: `${zkb.destroyedValue.toLocaleString(locale)} ISK`, inline: true },
				{ name: "Dropped", value: `${zkb.droppedValue.toLocaleString(locale)} ISK`, inline: true },
				{ name: "Fitted", value: `${zkb.fittedValue.toLocaleString(locale)} ISK`, inline: true },
				{ name: "Involved", value: `${involved}`, inline: true },
				{ name: "Points", value: `${zkb.points.toLocaleString(locale)}`, inline: true },
				{ name: "Killmail Value", value: `${zkb.totalValue.toLocaleString(locale)} ISK`, inline: true },
				{ name: "System", value: system.name, inline: true },
				{ name: "Constellation", value: constellation.name, inline: true },
				{ name: "Region", value: region.name, inline: true }
			],
			timestamp: new Date(killmail.killmail_time),
			url: url,
			author: { name: victim.character_name, icon_url: victim_img, url: victim_url },
			footer: { text: fb.character_name, icon_url: fb_img }
		};

		embeds_cache.set(embed_key, embed);
	}
	return embed;
}

async function postToDiscord(db, channelId, embed, colorCode) {
	try {
		let remove = false;
		try {
			const channel = await client.channels.fetch(channelId);

			if (channel && channel.isTextBased()) {
				// @ts-ignore
				const canSend = channel.permissionsFor(client.user)?.has([
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.EmbedLinks
				]);

				if (canSend) {
					embed.color = colorCode;
					// @ts-ignore
					await channel.send({
						embeds: [embed]
					});
					app_status.discord_post_count++;
				} else {
					remove = true;
				}
			} else {
				// We shouldn't even be here!
				remove = true;
			}
		} catch (err) {
			if ((err.status >= 400 && err.status <= 499) || (err.code == 50001 || err.code == 10003)) {
				console.log(err);
				remove = true;
			} else {
				// Something went wrong... keep the error in the logs but don't remove subscriptions just yet
				console.error(`Failed to send embed to ${channelId}:`, err);
			}
		}
		if (remove) {
			await removeSubscriptions(db, channelId);
		}
	} catch (e) {
		console.error(e);
	}
}

async function removeSubscriptions(db, channelId) {
	await client.db.subsCollection.deleteMany({ channelId: channelId });
	console.error(`Removing subscriptions for ${channelId}`);
}

export function applyConfigToEmbed(embed, config = {}) {
	// Make a shallow clone so we don’t mutate the original
	const cleaned = { ...embed };

	// ----- HEADER / AUTHOR -----
	if (config.header_victim === "hide") {
		delete cleaned.author;
	}

	// ----- TITLE -----
	if (config.title === "hide") {
		delete cleaned.title;
	}

	// ----- DESCRIPTION -----
	if (config.description === "hide") {
		cleaned.description = `[${embed.title}](${embed.url})`;
	}

	// ----- IMAGE / THUMBNAIL -----
	if (config.image === "hide") {
		delete cleaned.thumbnail;
	}

	// ----- FOOTER -----
	if (config.footer_final_blow === "hide") {
		delete cleaned.footer;
	}

	// ----- TIMESTAMP -----
	if (config.timestamp === "hide") {
		delete cleaned.timestamp;
	}

	// ----- FIELDS -----
	if (Array.isArray(cleaned.fields)) {
		cleaned.fields = cleaned.fields.filter(field => {
			const name = field.name.toLowerCase();

			if (config.destroyed === "hide" && name.includes("destroyed")) return false;
			if (config.dropped === "hide" && name.includes("dropped")) return false;
			if (config.fitted === "hide" && name.includes("fitted")) return false;
			if (config.involved === "hide" && name.includes("involved")) return false;
			if (config.points === "hide" && name.includes("points")) return false;
			if (config.total_value === "hide" && (name.includes("killmail") || name.includes("value"))) return false;

			if (config.system !== 'display' && name.includes("system")) return false;
			if (config.constellation !== 'display' && name.includes("constellation")) return false;
			if (config.region !== 'display' && name.includes("region")) return false;

			return true;
		});
	}

	return cleaned;
}
