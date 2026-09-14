CREATE TABLE IF NOT EXISTS "snapshotdata" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "username" TEXT,
    "capturedAt" TEXT,
    "overallLvl" INTEGER, "overallExp" INTEGER,
    "attackLvl" INTEGER, "attackExp" INTEGER,
    "defenceLvl" INTEGER, "defenceExp" INTEGER,
    "strengthLvl" INTEGER, "strengthExp" INTEGER,
    "hitpointsLvl" INTEGER, "hitpointsExp" INTEGER,
    "rangedLvl" INTEGER, "rangedExp" INTEGER,
    "prayerLvl" INTEGER, "prayerExp" INTEGER,
    "magicLvl" INTEGER, "magicExp" INTEGER,
    "cookingLvl" INTEGER, "cookingExp" INTEGER,
    "woodcuttingLvl" INTEGER, "woodcuttingExp" INTEGER,
    "fletchingLvl" INTEGER, "fletchingExp" INTEGER,
    "fishingLvl" INTEGER, "fishingExp" INTEGER,
    "firemakingLvl" INTEGER, "firemakingExp" INTEGER,
    "craftingLvl" INTEGER, "craftingExp" INTEGER,
    "smithingLvl" INTEGER, "smithingExp" INTEGER,
    "miningLvl" INTEGER, "miningExp" INTEGER,
    "herbloreLvl" INTEGER, "herbloreExp" INTEGER,
    "agilityLvl" INTEGER, "agilityExp" INTEGER,
    "thievingLvl" INTEGER, "thievingExp" INTEGER,
    "slayerLvl" INTEGER, "slayerExp" INTEGER,
    "farmingLvl" INTEGER, "farmingExp" INTEGER,
    "runecraftingLvl" INTEGER, "runecraftingExp" INTEGER,
    "hunterLvl" INTEGER, "hunterExp" INTEGER,
    "constructionLvl" INTEGER, "constructionExp" INTEGER
);
CREATE INDEX IF NOT EXISTS "idx_snapshotdata_username_capturedAt" ON "snapshotdata" ("username", "capturedAt");

-- Backfill: each startdata row becomes a snapshot timestamped at
-- midnight (start of day) of its startYear/startMonth/startDay.
INSERT INTO "snapshotdata" (
    "username", "capturedAt",
    "overallLvl", "overallExp",
    "attackLvl", "attackExp",
    "defenceLvl", "defenceExp",
    "strengthLvl", "strengthExp",
    "hitpointsLvl", "hitpointsExp",
    "rangedLvl", "rangedExp",
    "prayerLvl", "prayerExp",
    "magicLvl", "magicExp",
    "cookingLvl", "cookingExp",
    "woodcuttingLvl", "woodcuttingExp",
    "fletchingLvl", "fletchingExp",
    "fishingLvl", "fishingExp",
    "firemakingLvl", "firemakingExp",
    "craftingLvl", "craftingExp",
    "smithingLvl", "smithingExp",
    "miningLvl", "miningExp",
    "herbloreLvl", "herbloreExp",
    "agilityLvl", "agilityExp",
    "thievingLvl", "thievingExp",
    "slayerLvl", "slayerExp",
    "farmingLvl", "farmingExp",
    "runecraftingLvl", "runecraftingExp",
    "hunterLvl", "hunterExp",
    "constructionLvl", "constructionExp"
)
SELECT
    "username",
    printf('%04d-%02d-%02dT00:00:00.000Z', "startYear", "startMonth", "startDay"),
    "overallLvl", "overallExp",
    "attackLvl", "attackExp",
    "defenceLvl", "defenceExp",
    "strengthLvl", "strengthExp",
    "hitpointsLvl", "hitpointsExp",
    "rangedLvl", "rangedExp",
    "prayerLvl", "prayerExp",
    "magicLvl", "magicExp",
    "cookingLvl", "cookingExp",
    "woodcuttingLvl", "woodcuttingExp",
    "fletchingLvl", "fletchingExp",
    "fishingLvl", "fishingExp",
    "firemakingLvl", "firemakingExp",
    "craftingLvl", "craftingExp",
    "smithingLvl", "smithingExp",
    "miningLvl", "miningExp",
    "herbloreLvl", "herbloreExp",
    "agilityLvl", "agilityExp",
    "thievingLvl", "thievingExp",
    "slayerLvl", "slayerExp",
    "farmingLvl", "farmingExp",
    "runecraftingLvl", "runecraftingExp",
    "hunterLvl", "hunterExp",
    "constructionLvl", "constructionExp"
FROM "startdata";

-- Backfill: each enddata row becomes a snapshot timestamped at the very
-- end of its endYear/endMonth/endDay. enddata's day/month/year columns
-- are only ever set once at row creation (the 30-min cron only updates
-- the stat columns, never the date), so a user's start/end pair from the
-- same month usually shares an identical calendar day. Using end-of-day
-- here (as opposed to start-of-day for startdata above) is what keeps
-- the two rows ordering correctly as earliest/latest once collapsed
-- into one capturedAt-ordered table.
INSERT INTO "snapshotdata" (
    "username", "capturedAt",
    "overallLvl", "overallExp",
    "attackLvl", "attackExp",
    "defenceLvl", "defenceExp",
    "strengthLvl", "strengthExp",
    "hitpointsLvl", "hitpointsExp",
    "rangedLvl", "rangedExp",
    "prayerLvl", "prayerExp",
    "magicLvl", "magicExp",
    "cookingLvl", "cookingExp",
    "woodcuttingLvl", "woodcuttingExp",
    "fletchingLvl", "fletchingExp",
    "fishingLvl", "fishingExp",
    "firemakingLvl", "firemakingExp",
    "craftingLvl", "craftingExp",
    "smithingLvl", "smithingExp",
    "miningLvl", "miningExp",
    "herbloreLvl", "herbloreExp",
    "agilityLvl", "agilityExp",
    "thievingLvl", "thievingExp",
    "slayerLvl", "slayerExp",
    "farmingLvl", "farmingExp",
    "runecraftingLvl", "runecraftingExp",
    "hunterLvl", "hunterExp",
    "constructionLvl", "constructionExp"
)
SELECT
    "username",
    printf('%04d-%02d-%02dT23:59:59.999Z', "endYear", "endMonth", "endDay"),
    "overallLvl", "overallExp",
    "attackLvl", "attackExp",
    "defenceLvl", "defenceExp",
    "strengthLvl", "strengthExp",
    "hitpointsLvl", "hitpointsExp",
    "rangedLvl", "rangedExp",
    "prayerLvl", "prayerExp",
    "magicLvl", "magicExp",
    "cookingLvl", "cookingExp",
    "woodcuttingLvl", "woodcuttingExp",
    "fletchingLvl", "fletchingExp",
    "fishingLvl", "fishingExp",
    "firemakingLvl", "firemakingExp",
    "craftingLvl", "craftingExp",
    "smithingLvl", "smithingExp",
    "miningLvl", "miningExp",
    "herbloreLvl", "herbloreExp",
    "agilityLvl", "agilityExp",
    "thievingLvl", "thievingExp",
    "slayerLvl", "slayerExp",
    "farmingLvl", "farmingExp",
    "runecraftingLvl", "runecraftingExp",
    "hunterLvl", "hunterExp",
    "constructionLvl", "constructionExp"
FROM "enddata";

DROP TABLE "startdata";
DROP TABLE "enddata";
