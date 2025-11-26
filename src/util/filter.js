'use strict';

const OP_REGEX = /(<=|>=|!=|=|<|>)/;
const cache = new Map();

function parseFilters(filterStr) {
	if (!filterStr) return null;
	if (cache.has(filterStr)) return cache.get(filterStr);

	const parsed = parseExpression(filterStr.trim());
	cache.set(filterStr, parsed);
	return parsed;
}

//
// Grammar:
//   EXPR := TERM ("," TERM)*         OR groups
//   TERM := FACTOR (";" FACTOR)*     AND groups
//   FACTOR := RULE | "(" EXPR ")"
//   RULE := key <op> value
//

function parseExpression(str) {
	let i = 0;

	function skipSpace() {
		while (i < str.length && /\s/.test(str[i])) i++;
	}

	// Parse a RULE like "size>10"
	function parseRule() {
		skipSpace();

		// Find operator FIRST — no more scanning the whole string manually.
		const opMatch = str.substring(i).match(OP_REGEX);
		if (!opMatch) throw new Error("Invalid rule: missing operator");

		const op = opMatch[0];

		// index of operator inside the remaining string
		const opIndex = str.indexOf(op, i);

		if (opIndex === -1) {
			throw new Error("Unable to locate operator");
		}

		// Extract key
		const key = str.substring(i, opIndex).trim();

		// Move cursor past operator
		i = opIndex + op.length;

		skipSpace();

		// Value ends at next delimiter: ',', ';', ')'
		let start = i;
		while (i < str.length && !/[),;]/.test(str[i])) {
			i++;
		}

		const rawVal = str.substring(start, i).trim();
		const val = isNaN(rawVal) ? rawVal : Number(rawVal);

		return { key, op, val };
	}


	// Parse FACTOR: a rule or a parenthesized (EXPR)
	function parseFactor() {
		skipSpace();
		if (str[i] === '(') {
			i++; // skip '('
			const sub = parseExpr();
			skipSpace();
			if (str[i] !== ')') throw new Error("Missing closing )");
			i++; // skip ')'
			return sub;
		}
		return parseRule();
	}

	// Parse TERM separated by ';'  (AND)
	function parseTerm() {
		const factors = [parseFactor()];
		skipSpace();
		while (str[i] === ';') {
			i++; // skip ;
			factors.push(parseFactor());
			skipSpace();
		}
		if (factors.length === 1 && !factors[0].operator) {
			// single rule or single group
			return factors[0];
		}
		return { operator: "AND", rules: factors };
	}

	// Parse EXPR separated by ','  (OR)
	function parseExpr() {
		const terms = [parseTerm()];
		skipSpace();
		while (str[i] === ',') {
			i++; // skip ,
			terms.push(parseTerm());
			skipSpace();
		}
		if (terms.length === 1 && !terms[0].operator) {
			// single group or rule
			return terms[0];
		}
		return { operator: "OR", rules: terms };
	}

	const out = parseExpr();
	skipSpace();
	if (i < str.length) {
		throw new Error("Unexpected characters at: " + str.substring(i));
	}
	return out;
}

// Recursive traversal — collects ALL values for a given key
function findValues(obj, key) {
	let results = [];
	if (Array.isArray(obj)) {
		for (const el of obj) results = results.concat(findValues(el, key));
	} else if (obj && typeof obj === "object") {
		for (const k in obj) {
			if (k === key) {
				if (Array.isArray(obj[k])) {
					results = results.concat(obj[k]);
				} else {
					results.push(obj[k]);
				}
			}
			results = results.concat(findValues(obj[k], key));
		}
	}
	return results;
}

function compare(op, a, b) {
	const isNum = !isNaN(a) && !isNaN(b);
	if (isNum) {
		a = Number(a);
		b = Number(b);
	} else {
		a = String(a);
		b = String(b);
	}
	switch (op) {
		case "=": return a == b;
		case "!=": return a != b;
		case "<": return a < b;
		case "<=": return a <= b;
		case ">": return a > b;
		case ">=": return a >= b;
		default: return false;
	}
}

function matchesFilter(pkg, filter) {
	if (!filter) return true;

	// If nested group
	if (filter.operator && filter.rules) {
		if (filter.operator === "AND") {
			return filter.rules.every(r => matchesFilter(pkg, r));
		} else {
			return filter.rules.some(r => matchesFilter(pkg, r));
		}
	}

	// Primitive rule
	const values = findValues(pkg, filter.key);
	return values.some(v => compare(filter.op, v, filter.val));
}

export {
	parseFilters,
	findValues,
	compare,
	matchesFilter
};
