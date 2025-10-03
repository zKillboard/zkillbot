import {getFirstString} from "../../../util/helpers.js";
import {EmbedBuilder} from "discord.js";
import {getNames} from "../../information.js";

export async function interaction(db, interaction) {
    const { channelId } = interaction;

    let doc = await db.subsCollection.findOne({ channelId: channelId });
    if (!doc || doc.checked != true) {
        return ' 🛑 Before you show a subscription group, please run `/zkillbot check`` to ensure all permissions are set properly for this channel and create a subscription group.';
    }

    let subGroup = getFirstString(interaction, ["group_name"]);
    if (!doc.subgroups || !Object.keys(doc.subgroups).includes(subGroup)) {
        return `🛑 Subscription group **${subGroup}** does not exists`;
    }

    const res = await db.subsCollection.updateOne({ channelId: channelId }, { $set: { [`subgroups.${subGroup}.enabled`]: true } });
    if (res.modifiedCount > 0) {
        return `✅ Subscription group **${subGroup}** has been enabled.`;
    } else {
        return `🛑 Subscription group **${subGroup}** was already enabled.`;
    }
}
