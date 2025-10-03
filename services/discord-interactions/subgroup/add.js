import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../../../util/constants.js";
import { getNames } from "../../information.js";
import { getFirstString, unixtime } from "../../../util/helpers.js";

export async function interaction(db, interaction) {
    const { guildId, channelId } = interaction;

    let doc = await db.subsCollection.findOne({ channelId: channelId });
    if (!doc || doc.checked != true) {
        return ' 🛑 Before you subscribe, please run `/zkillbot check`` to ensure all permissions are set properly for this channel';
    }
    const subGroup = interaction.options.getString("group_name");
    if (doc.subgroups && !Object.keys(doc.subgroups).includes(subGroup)) {
        return `🛑 Subscription group **${valueRaw}** does not exists`;
    }

    const subgroupObj = doc.subgroups[subGroup];

    let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]).toLowerCase();

    if (valueRaw.startsWith(ISK_PREFIX)) {
        const iskValue = Number(valueRaw.substr(ISK_PREFIX.length));
        if (Number.isNaN(iskValue)) {
            return ` ❌ Unable to subscribe... **${valueRaw}** is not a number`;
        }
        if (iskValue < 100000000) {
            return ` ❌ Unable to subscribe... **${valueRaw}** needs to be at least 100 million`;
        }

        await db.subsCollection.updateOne(
            { guildId, channelId },
            { $set: { [`subgroups.${subGroup}.iskValue`]: iskValue } },
            { upsert: true }
        );

        return `📡 Subscribed this channel to killmails having iskValue of at least ${iskValue}`;
    } else if (valueRaw.startsWith(LABEL_PREFIX)) {
        const label_filter = valueRaw.slice(LABEL_PREFIX.length).trim().toLowerCase();
        if (LABEL_FILTERS.indexOf(label_filter) < 0) {
            return ` ❌ Unable to subscribe to label **${label_filter}**, it is not one of the following:\n` + LABEL_FILTERS.join(', ');
        }

        // if no label filter is set yet, we set the new one as the only filter
        if (subgroupObj.labels[0] === "all") {
            await db.subsCollection.updateOne(
                { guildId, channelId },
                { $set: { [`subgroups.${subGroup}.labels`]: [label_filter] } },
                { upsert: true }
            );
        } else {
            await db.subsCollection.updateOne(
                { guildId, channelId },
                { $addToSet: { [`subgroups.${subGroup}.labels`]: label_filter } },
                { upsert: true }
            );
        }

        return `📡 Subscribed the subscription group ${subGroup} to killmails having label **${label_filter}**`;
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

                return ` ❕Too many results for **${valueRaw}**, pick one by ID or use a more specific query:\n${formatted}`;
            }

            if (suggestions.length == 0) {
                return ` ❌ Unable to subscribe... **${valueRaw}** did not come up with any search results`;
            }
            entityId = suggestions[0].data.id;
        }

        let names = await getNames(db, [entityId]);
        if (Object.values(names).length === 0) {
            return ` ❌ Unable to subscribe... **${valueRaw}** is not a valid entity id`;
        }
        const name = names[entityId];

        // if no entity is set yet, we set the new one as the only entity
        if (subgroupObj.entityIds[0] === 0) {
            await db.subsCollection.updateOne(
                { guildId, channelId },
                { $set: { [`subgroups.${subGroup}.entityIds`]: [entityId] } },
                { upsert: true }
            );
        } else {
            await db.subsCollection.updateOne(
                { guildId, channelId },
                { $addToSet: { [`subgroups.${subGroup}.entityIds`]: entityId } },
                { upsert: true }
            );
        }

        await db.entities.updateOne(
            { entity_id: entityId, name: name },
            { $setOnInsert: { last_updated: unixtime() } },
            { upsert: true }
        );

        return `📡 Subscribed the subscription group ${subGroup} to ${name}`;
    }
}