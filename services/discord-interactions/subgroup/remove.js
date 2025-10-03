import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../../../util/constants.js";
import { getNames } from "../../information.js";
import { getFirstString } from "../../../util/helpers.js";

export async function interaction(db, interaction) {
    const { guildId, channelId } = interaction;

    let doc = await db.subsCollection.findOne({ channelId: channelId });

    const subGroup = interaction.options.getString("group_name");
    if (doc.subgroups && !Object.keys(doc.subgroups).includes(subGroup)) {
        return `🛑 Subscription group **${valueRaw}** does not exists`;
    }

    const subgroupObj = doc.subgroups[subGroup];

    let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

    if (valueRaw.startsWith(ISK_PREFIX)) {
        const res = await db.subsCollection.updateOne(
            { guildId, channelId },
            { $set: { [`subgroups.${subGroup}.iskValue`]: 0 } }
        );

        if (res.modifiedCount > 0) {
            return `❌ Unsubscribed the subscription group ${subGroup} from killmails of a minimum isk value`;
        } else {
            return `⚠️ No subscription found for killmails of a minimum isk value`;
        }
    }

    if (valueRaw.startsWith(LABEL_PREFIX)) {
        const label_filter = valueRaw.substr(LABEL_PREFIX.length);
        let res;
        if (subgroupObj.labels.length === 1 && subgroupObj.labels.includes(label_filter)) {
            res = await db.subsCollection.updateOne(
                { guildId, channelId },
                { $set: { [`subgroups.${subGroup}.labels`]: ["all"] } }
            );
        } else {
            res = await db.subsCollection.updateOne(
                { guildId, channelId },
                { $pull: { [`subgroups.${subGroup}.labels`]: label_filter } }
            );
        }


        if (res.modifiedCount > 0) {
            return `❌ Unsubscribed the subscription group ${subGroup} from label **${label_filter}**`;
        } else {
            return `⚠️ No subscription found for label **${label_filter}**`;
        }
    }

    const entityId = Number(valueRaw);
    if (Number.isNaN(entityId)) {
        return ` ❌ Unable to unsubscribe... **${valueRaw}** is not a number`;
    }
    let res;
    if (subgroupObj.entityIds.length === 1 && subgroupObj.entityIds.includes(entityId)) {
        res = await db.subsCollection.updateOne(
            { guildId, channelId },
            { $set: { [`subgroups.${subGroup}.entityIds`]: [0] } }
        );
    } else {
        res = await db.subsCollection.updateOne(
            { guildId, channelId },
            { $pull: { [`subgroups.${subGroup}.entityIds`]: entityId } }
        );
    }

    if (res.modifiedCount > 0) {
        return `❌ Unsubscribed the subscription group ${subGroup} from **${entityId}**`;
    } else {
        return `⚠️ No subscription found for **${entityId}**`;
    }
}