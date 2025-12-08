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
//   FACTOR := RULE | "(" EXPR ")" | ELEMMATCH
//   ELEMMATCH := "[" EXPR "]"        Match all conditions within same array element
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

		// Value ends at next delimiter: ',', ';', ')', ']'
		let start = i;
		while (i < str.length && !/[),;\]]/.test(str[i])) {
			i++;
		}

		const rawVal = str.substring(start, i).trim();
		const val = isNaN(rawVal) ? rawVal : Number(rawVal);

		return { key, op, val };
	}


	// Parse FACTOR: a rule, parenthesized (EXPR), or elemMatch [EXPR]
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
		if (str[i] === '[') {
			i++; // skip '['
			const sub = parseExpr();
			skipSpace();
			if (str[i] !== ']') throw new Error("Missing closing ]");
			i++; // skip ']'
			return { operator: "ELEMMATCH", rules: Array.isArray(sub.rules) ? sub.rules : [sub] };
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

// Find all arrays in the object structure
function findArrays(obj) {
	let results = [];
	if (Array.isArray(obj)) {
		results.push(obj);
		for (const el of obj) {
			results = results.concat(findArrays(el));
		}
	} else if (obj && typeof obj === "object") {
		for (const k in obj) {
			if (Array.isArray(obj[k])) {
				results.push(obj[k]);
			}
			results = results.concat(findArrays(obj[k]));
		}
	}
	return results;
}

// Check if a single object matches all rules in a filter
function matchesObject(obj, rules) {
	for (const rule of rules) {
		if (rule.operator && rule.rules) {
			// Nested group within elemMatch
			if (rule.operator === "AND") {
				if (!matchesObject(obj, rule.rules)) return false;
			} else if (rule.operator === "OR") {
				if (!rule.rules.some(r => matchesObject(obj, [r]))) return false;
			}
		} else {
			// Single rule
			const values = findValues(obj, rule.key);
			if (!values.some(v => compare(rule.op, v, rule.val))) {
				return false;
			}
		}
	}
	return true;
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
		} else if (filter.operator === "OR") {
			return filter.rules.some(r => matchesFilter(pkg, r));
		} else if (filter.operator === "ELEMMATCH") {
			// Find all arrays in the package and check if any element matches all rules
			const arrays = findArrays(pkg);
			for (const arr of arrays) {
				for (const elem of arr) {
					if (matchesObject(elem, filter.rules)) {
						return true;
					}
				}
			}
			return false;
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
