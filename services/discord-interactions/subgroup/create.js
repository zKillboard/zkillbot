import {getFirstString} from "../../../util/helpers.js";

export async function interaction(db, interaction) {
    const { channelId } = interaction;

    let doc = await db.subsCollection.findOne({ channelId: channelId });
    if (!doc || doc.checked != true) {
        return ' 🛑 Before you create a subscription group, please run `/zkillbot check`` to ensure all permissions are set properly for this channel';
    }
    // TODO: Potentially cache known names of subgroups for channels
    let valueRaw = getFirstString(interaction, ["group_name"]);
    if (doc.subgroups && Object.keys(doc.subgroups).includes(valueRaw)) {
        return `🛑 Subscription group **${valueRaw}** already exists`;
    }
    await db.subsCollection.updateOne({ channelId: channelId }, { $set: { [`subgroups.${valueRaw}`]: {} } });
    return `✅ Successfully added subscription group **${valueRaw}**`
}
