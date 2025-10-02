import { MongoClient } from "mongodb";
import { SEVEN_DAYS } from "./constants.js";

export async function initMongo(MONGO_URI, MONGO_DB) {
	const mongo = new MongoClient(MONGO_URI);
	await mongo.connect();
	const db = mongo.db(MONGO_DB);

	const entities = db.collection('entities');
	await entities.createIndex({ entity_id: 1 });
	await entities.createIndex({ last_updated: 1 });

	const sentHistory = db.collection('subshistory');
	await sentHistory.createIndex({ channelId: 1, killmail_id: 1 }, { unique: true });
	await sentHistory.createIndex({ createdAt: 1 }, { expireAfterSeconds: SEVEN_DAYS }); // 7 days

	const subsCollection = db.collection("subscriptions");
	await subsCollection.createIndex({ entityIds: 1 });
	await subsCollection.createIndex({ iskValue: 1 });
	await subsCollection.createIndex({ labels: 1 });
	console.log("✅ Connected to MongoDB");

	return { db, entities, sentHistory, subsCollection };
}
