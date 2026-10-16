export function splitMessage(content, maxLength = 2000) {
	if (content.length <= maxLength) return [content];

	const chunks = [];
	let remaining = content;

	while (remaining.length > maxLength) {
		let splitAt = remaining.lastIndexOf("\n", maxLength);
		if (splitAt <= 0) splitAt = maxLength;

		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt + (remaining[splitAt] === "\n" ? 1 : 0));
	}

	if (remaining.length > 0) chunks.push(remaining);
	return chunks;
}
