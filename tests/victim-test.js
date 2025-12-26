import { parseFilters, matchesFilter } from '../src/util/filter.js';

// Simplified killmail structure
const mockKillmail = {
	package: {
		killmail: {
			victim: {
				alliance_id: 99003581,
				character_id: 2123512125,
				is_victim: true
			},
			attackers: [
				{
					character_id: 2120033834,
					alliance_id: 132180077,
					is_victim: false
				}
			]
		}
	}
};

console.log('Testing victim-related filters\n' + '='.repeat(70));

// Test 1: Non-elemMatch - should work
console.log('\nTest 1: alliance_id=99003581;is_victim=true (no elemMatch)');
const filter1 = parseFilters('alliance_id=99003581;is_victim=true');
const result1 = matchesFilter(mockKillmail, filter1);
console.log(`Result: ${result1 ? 'MATCH ✅' : 'NO MATCH ❌'}`);
console.log('Expected: MATCH (victim has both, but they\'re checked separately)');

// Test 2: ElemMatch - checking if victim is in an array
console.log('\nTest 2: [alliance_id=99003581;is_victim=true] (with elemMatch)');
const filter2 = parseFilters('[alliance_id=99003581;is_victim=true]');
const result2 = matchesFilter(mockKillmail, filter2);
console.log(`Result: ${result2 ? 'MATCH ✅' : 'NO MATCH ❌'}`);
console.log('Expected: ??? (victim is not in an array - is this the problem?)');

// Test 3: ElemMatch for attacker
console.log('\n\nTest 3: [alliance_id=132180077;is_victim=false] (attacker in array)');
const filter3 = parseFilters('[alliance_id=132180077;is_victim=false]');
const result3 = matchesFilter(mockKillmail, filter3);
console.log(`Result: ${result3 ? 'MATCH ✅' : 'NO MATCH ❌'}`);
console.log('Expected: MATCH (attacker IS in array)');

console.log('\n' + '='.repeat(70));
console.log('\nConclusion:');
console.log('elemMatch only works with array elements.');
console.log('The victim is not in an array, so elemMatch cannot match it.');
console.log('Use regular filters (without []) for victim-related queries.');
