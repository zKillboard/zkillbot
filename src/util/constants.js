export const LOCALE = 'en';

export const HEADERS = {
	headers: {
		"User-Agent": "zKillBot",
		"Accept": "application/json"
	}
};

export const SUGGESTION_LABEL_FILTERS = [
	"#:1", "#:5+", "#:10+", "#:25+", "#:50+", "#:100+", 
	"awox", "bigisk", "capital",
	"concord",
	"fw:amarr", "fw:caldari", "fw:gallente", "fw:minmatar", "fw:amamin", "fw:calgal",
	"insaneisk",
	"loc:abyssal", "loc:drifter", "loc:highsec", "loc:lowsec", "loc:nullsec", "loc:w-space",
	"npc", "pvp", "solo",
	"tz:au", "tz:eu", "tz:ru", "tz:use", "tz:usw"
];

export const LABEL_FILTERS = [
	"#:1", "#:2+", "#:5+", "#:10+", "#:25+", "#:50+", "#:100+", "#:1000+",
	"atShip", "awox", "bigisk", "capital",
	"cat:11", "cat:18", "cat:22", "cat:23", "cat:350001", "cat:40", "cat:46", "cat:6", "cat:65", "cat:87",
	"concord", "extremeisk",
	"fw:amarr", "fw:caldari", "fw:gallente", "fw:minmatar", "fw:amamin", "fw:calgal",
	"ganked", "insaneisk",
	"isk:100b+", "isk:10b+", "isk:1b+", "isk:1t+", "isk:5b+", "isk:1t+",
	"loc:abyssal", "loc:drifter", "loc:highsec", "loc:lowsec", "loc:nullsec", "loc:w-space",
	"npc", "padding", "pvp", "solo",
	"tz:au", "tz:eu", "tz:ru", "tz:use", "tz:usw"
];

export const HOURS_24 = 86400; // number of seconds in 1 day
export const DAYS_3 = HOURS_24 * 3;
export const DAYS_7 = HOURS_24 * 7;
export const DAYS_90 = HOURS_24 * 90;
export const ISK_PREFIX = 'isk:', LABEL_PREFIX = 'label:', ADVANCED_PREFIX = 'advanced:';
