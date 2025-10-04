export async function sendWebhook(webhookURL, payload, wait = true) {
	if (webhookURL && process.env.NODE_ENV !== "development") {
		const url = webhookURL + (wait ? "?wait=true" : "");
		return await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: payload,
				avatar_url: 'https://cdn.discordapp.com/icons/849992399639281694/4cf3d7dba477c789883b292f46bfc016.png',
				username: 'zKillBot'
			})
		});
	}
}