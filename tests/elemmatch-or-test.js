import { parseFilters, matchesFilter } from '../src/util/filter.js';

// This test specifically checks the OR behavior inside elemMatch

const mockKillmail = {
	package: {
		killmail: {
			attackers: [
				{
					character_id: 1234,
					group_id: 26
				},
				{
					character_id: 9999,
					group_id: 27
				}
			]
		}
	}
};

console.log('Testing elemMatch with OR behavior\n' + '='.repeat(70));

// This should match if there's an attacker with character_id=1234 OR character_id=5678
// Since first attacker has character_id=1234, it should MATCH
const filter1 = '[character_id=1234,character_id=5678]';
console.log(`\nTest 1: ${filter1}`);
console.log('Expected: MATCH (first attacker has character_id=1234)');

const parsed1 = parseFilters(filter1);
console.log('Parsed structure:', JSON.stringify(parsed1, null, 2));

const result1 = matchesFilter(mockKillmail, parsed1);
console.log(`Result: ${result1 ? 'MATCH ✅' : 'NO MATCH ❌'}`);

if (!result1) {
	console.log('❌ BUG FOUND: Should match but does not!');
}

// This should match if there's an attacker with character_id=5678 OR character_id=9999
// Since second attacker has character_id=9999, it should MATCH
const filter2 = '[character_id=5678,character_id=9999]';
console.log(`\n\nTest 2: ${filter2}`);
console.log('Expected: MATCH (second attacker has character_id=9999)');

const parsed2 = parseFilters(filter2);
const result2 = matchesFilter(mockKillmail, parsed2);
console.log(`Result: ${result2 ? 'MATCH ✅' : 'NO MATCH ❌'}`);

if (!result2) {
	console.log('❌ BUG FOUND: Should match but does not!');
}

// This should NOT match because no attacker has both character_id values
const filter3 = '[character_id=5678,character_id=7777]';
console.log(`\n\nTest 3: ${filter3}`);
console.log('Expected: NO MATCH (no attacker has character_id=5678 or 7777)');

const parsed3 = parseFilters(filter3);
const result3 = matchesFilter(mockKillmail, parsed3);
console.log(`Result: ${result3 ? 'MATCH ❌' : 'NO MATCH ✅'}`);

if (result3) {
	console.log('❌ BUG FOUND: Should not match but does!');
}

// More complex: (character_id=1234 OR character_id=5678) AND group_id=26
const filter4 = '[(character_id=1234,character_id=5678);group_id=26]';
console.log(`\n\nTest 4: ${filter4}`);
console.log('Expected: MATCH (first attacker has character_id=1234 AND group_id=26)');

const parsed4 = parseFilters(filter4);
console.log('Parsed structure:', JSON.stringify(parsed4, null, 2));

const result4 = matchesFilter(mockKillmail, parsed4);
console.log(`Result: ${result4 ? 'MATCH ✅' : 'NO MATCH ❌'}`);

if (!result4) {
	console.log('❌ BUG FOUND: Should match but does not!');
}

console.log('\n' + '='.repeat(70));
