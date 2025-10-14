import { MongoClient } from "mongodb";
import { HOURS_24, DAYS_7 } from "./constants.js";

export async function initMongo(MONGO_URI, MONGO_DB) {
	const mongo = new MongoClient(MONGO_URI);
	await mongo.connect();
	const db = mongo.db(MONGO_DB);

	const entities = db.collection('entities');
	await entities.createIndex({ entity_id: 1 });
	await entities.createIndex({ createdAt: 1 }, { expireAfterSeconds: DAYS_7 });
	await entities.updateMany(
		{ createdAt: { $exists: false } },
		{ $set: { createdAt: new Date() } }
	);

	const sentHistory = db.collection('subshistory');
	await sentHistory.createIndex({ channelId: 1, killmail_id: 1 }, { unique: true });
	await sentHistory.createIndex({ createdAt: 1 }, { expireAfterSeconds: DAYS_7 });

	const subsCollection = db.collection("subscriptions");
	await subsCollection.createIndex({ entityIds: 1 });
	await subsCollection.createIndex({ iskValue: 1 });
	await subsCollection.createIndex({ labels: 1 });

	const information = db.collection("information");
	await information.createIndex({ type: 1, id: 1 }, { unique: true });

	const matches = db.collection("matches");
	await matches.createIndex({ killmail_id: 1 });
	await matches.createIndex({ channelId: 1 });
	await matches.createIndex({ createdAt: 1 }, { expireAfterSeconds: HOURS_24 });

	const channels = db.collection('channels');
	await channels.createIndex({ guildId: 1 });
	await channels.createIndex({ channelId: 1 }, { unique: true });

	const interactionLogs = db.collection("interactionLogs");
	await interactionLogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: DAYS_7 });

	const guilds = db.collection("guilds");
	await guilds.createIndex({ guildId: 1 }, { unique: true });

	console.log("✅ Connected to MongoDB");

	return { db, channels, entities, sentHistory, subsCollection, information, matches, interactionLogs, guilds };
}
