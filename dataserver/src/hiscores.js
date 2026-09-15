const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Fetches `username`'s raw hiscore CSV text from the Jagex OSRS hiscore API.
// Rejects with "Username not found in jagex API" on a non-ok response,
// matching the error message the /users/add handler and captureSnapshot
// have always sent to their callers.
function fetchHiscore(username) {
    return fetch(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${username}`, {method: 'GET', headers: {}})
        .then(res => {
            if (!res.ok) {
                throw new Error("Username not found in jagex API");
            }
            return res.text();
        });
}
exports.fetchHiscore = fetchHiscore;

// Parses the raw hiscore CSV text into the [[lvl, exp], ...] shape used by
// recordSnapshot: overall + 23 skills, one entry per hiscore row.
function parseHiscoreRows(text) {
    var rows = text.split("\n");
    var infoArr = [];

    for (let i = 0; i < 25; i++) {
        var row = rows[i].split(",");
        infoArr.push([row[1], row[2]]);
    }

    return infoArr;
}
exports.parseHiscoreRows = parseHiscoreRows;
