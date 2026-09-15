'use strict'

// Covers src/hiscores.js's parseHiscoreRows: a pure function, so this
// exercises it directly against realistic hiscore-CSV-shaped input rather
// than mocking anything. fetchHiscore itself is not covered here -- it hits
// the real Jagex OSRS hiscore API over the network, and no other test in
// this suite touches the network; see the test-author report for the
// judgment call on leaving it uncovered.

const test = require('node:test')
const assert = require('node:assert/strict')

const { parseHiscoreRows } = require('../src/hiscores.js')

// The real hiscore-lite API's actual shape: line 0 is the "Overall"
// summary (rank,level,exp), lines 1-23 are the 23 skills in the API's fixed
// order (rank,level,exp each -- the same order src/db/snapshots.js's
// SKILL_COLUMNS expects), and everything from line 24 on is an
// activity/minigame/boss entry, which the real API only gives two
// comma-separated fields (rank,score) instead of three.
const SKILL_LINES = [
    '123456,1750,300000000', // Overall
    '45678,99,13034431',     // Attack
    '52341,99,13034431',     // Defence
    '38291,99,13034431',     // Strength
    '61234,99,13034431',     // Hitpoints
    '71234,99,13034431',     // Ranged
    '81234,99,13034431',     // Prayer
    '91234,99,13034431',     // Magic
    '101234,99,13034431',    // Cooking
    '111234,50,101333',      // Woodcutting
    '121234,99,13034431',    // Fletching
    '131234,99,13034431',    // Fishing
    '141234,99,13034431',    // Firemaking
    '151234,99,13034431',    // Crafting
    '161234,99,13034431',    // Smithing
    '171234,99,13034431',    // Mining
    '181234,99,13034431',    // Herblore
    '191234,99,13034431',    // Agility
    '201234,99,13034431',    // Thieving
    '211234,99,13034431',    // Slayer
    '221234,99,13034431',    // Farming
    '231234,99,13034431',    // Runecrafting
    '241234,99,13034431',    // Hunter
    '251234,99,13034431',    // Construction
]
const FIRST_ACTIVITY_LINE = '9999,42' // e.g. League Points: only rank,score
const TRAILING_ACTIVITY_LINES = ['-1,-1', '54321,7']

const SAMPLE_CSV = [...SKILL_LINES, FIRST_ACTIVITY_LINE, ...TRAILING_ACTIVITY_LINES].join('\n')

test('parseHiscoreRows turns the first 25 raw hiscore CSV lines into 25 [col1, col2] pairs, in line order', () => {
    const infoArr = parseHiscoreRows(SAMPLE_CSV)

    assert.strictEqual(infoArr.length, 25, 'should produce one pair per of the first 25 lines (Overall + 23 skills + 1 activity line)')

    // Overall + the 23 skills: each pair is [level, exp] straight off that
    // line's columns 1 and 2.
    for (let i = 0; i < SKILL_LINES.length; i++) {
        const [, level, exp] = SKILL_LINES[i].split(',')
        assert.deepStrictEqual(infoArr[i], [level, exp], `line ${i} should parse to [level, exp]`)
    }

    // The 25th line read (index 24) is the first activity line. The real
    // API only gives two comma-separated fields there (rank,score), so
    // column 2 genuinely does not exist on that line -- parseHiscoreRows
    // does not special-case it: it produces [score, undefined].
    const [, score] = FIRST_ACTIVITY_LINE.split(',')
    assert.deepStrictEqual(infoArr[24], [score, undefined], 'the boundary activity line has no third column, so its pair is [score, undefined]')
})

test('parseHiscoreRows never reads past the first 25 lines', () => {
    const withoutTrailing = [...SKILL_LINES, FIRST_ACTIVITY_LINE].join('\n')
    const withTrailing = SAMPLE_CSV // same lines plus TRAILING_ACTIVITY_LINES

    assert.deepStrictEqual(
        parseHiscoreRows(withTrailing),
        parseHiscoreRows(withoutTrailing),
        'appending further activity lines after line 24 must not change the result'
    )
})

test('parseHiscoreRows is pure: calling it twice on the same input yields equal but independent arrays', () => {
    const first = parseHiscoreRows(SAMPLE_CSV)
    const second = parseHiscoreRows(SAMPLE_CSV)
    assert.deepStrictEqual(first, second)
    assert.notStrictEqual(first, second, 'each call should return its own array, not a shared/cached one')
})
