import NodeCache from "node-cache";
import { PermissionFlagsBits } from "discord.js";

import { getNames, fillNames } from "./information.js";
import { LOCALE } from "../util/constants.js";
import { getIDs } from "../util/helpers.js";
import { app_status } from "../util/app-status.js";
import { client } from "../zkillbot.js";
import { getSystemNameAndRegion } from "./information.js";


export const discord_posts_queue = [];
export async function doDiscordPosts(db) {
	try {
		while (discord_posts_queue.length > 0) {
			const { db, match, channelId, killmail, zkb, colorCode, matchType } = discord_posts_queue.shift();

			// ensure we haven't posted this killmail to this channel yet
			try {
				await db.sentHistory.insertOne({ channelId: channelId, killmail_id: killmail.killmail_id, createdAt: new Date() });
			} catch (err) {
				if (err.code === 11000) {
					// ⚠️ Duplicate key → already sent to this channel
				} else {
					console.error("Insert/send failed:", err);
				}
				continue; // loop without waiting
			}

			let embed = await getKillmailEmbeds(db, killmail, zkb, colorCode);
			postToDiscord(channelId, embed); // lack of await is on purpose

			const matchDoc = {
				match: match,
				channelId: channelId,
				killmail: killmail,
				zkb: zkb,
				match_type: matchType,
				colorCode: colorCode,
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
const embeds_cache = new NodeCache({ stdTTL: 30 });

async function getKillmailEmbeds(db, killmail, zkb, colorCode) {
	let embed = embeds_cache.get(killmail.killmail_id);
	if (!embed) {
		const url = `https://zkillboard.com/kill/${killmail.killmail_id}/`;

		let final_blow = killmail.attackers[0]; // default to first
		for (let attacker of killmail.attackers) {
			if (attacker.final_blow) {
				final_blow = attacker;
				break;
			}
		}
		const [names, system] = await Promise.all([
			getNames(db, [...getIDs(killmail.victim), ...getIDs(final_blow)]),
			getSystemNameAndRegion(db, killmail.solar_system_id)
		]);

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

		const description = `${victim.character_name} (${victim_employer}) lost their ${victim.ship_type_name} in ${system}. Final Blow by ${fb.character_name} (${fb_employer})${solo} in their ${fb.ship_type_name}${others}. Total Value: ${zkb.totalValue.toLocaleString(LOCALE)} ISK`;

		embed = {
			title: victim.character_name + (victim.character_name.endsWith('s') ? "' " : "'s ") + victim.ship_type_name,
			description: description,
			color: colorCode,
			thumbnail: { url: image, height: 64, width: 64 },
			fields: [
				{ name: "Destroyed", value: `${zkb.destroyedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Dropped", value: `${zkb.droppedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Fitted", value: `${zkb.fittedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Involved", value: `${killmail.attackers.length.toLocaleString(LOCALE)}`, inline: true },
				{ name: "Points", value: `${zkb.points.toLocaleString(LOCALE)}`, inline: true },
				{ name: "Killmail Value", value: `${zkb.totalValue.toLocaleString(LOCALE)} ISK`, inline: true },
			],
			timestamp: new Date(killmail.killmail_time),
			url: url,
			author: { name: victim.character_name, icon_url: victim_img, url: victim_url },
			footer: { text: fb.character_name, icon_url: fb_img }
		};

		embeds_cache.set(killmail.killmail_id, embed);
	}
	return embed;
}

async function postToDiscord(channelId, embed) {
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
				remove = true;
			} else {
				// Something went wrong... keep the error in the logs but don't remove subscriptions just yet
				console.error(`Failed to send embed to ${channelId}:`, err);
			}
		}
		if (remove) {
			await client.db.subsCollection.deleteMany({ channelId: channelId });
			console.error(`Removing subscriptions for ${channelId}`);
		}
	} catch (e) {
		console.log(e);
	}
}
