/* eslint no-undef: 0 */
// const {inspect} = require("util");
module.exports = async (Bot, client) => {
    // Logs that it's up, and some extra info
    client.shard.id = client.shard.ids[0];

    const application = await client.fetchApplication();
    if (!Bot.isMain() && application.botPublic && application.owner.id !== "124579977474736129") {
        Bot.logger.error(Buffer.from("RkFUQUwgRVJST1I6IElOVkFMSUQgQk9UIFNFVFVQCgpHbyB0byB5b3VyIEJvdCdzIGFwcGxpY2F0aW9uIHBhZ2UgaW4gRGlzY29yZCBEZXZlbG9wZXJzIHNpdGUgYW5kIGRpc2FibGUgdGhlICJQdWJsaWMgQm90IiBvcHRpb24uCgpQbGVhc2UgY29udGFjdCB0aGUgc3VwcG9ydCB0ZWFtIGF0IFNXR29IQm90IEhRIC0gaHR0cHM6Ly9kaXNjb3JkLmdnL0Zmd0d2aHIgLSBmb3IgbW9yZSBpbmZvcm1hdGlvbi4=", "base64").toString("utf-8"));
        if (client.shard) { await client.shard.broadcastEval("this.destroy()");
        } else { process.exit(); }
        return null;
    }

    let readyString = `${client.user.username} is ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers.`;
    if (client.shard) {
        readyString = `${client.user.username} is ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers. Shard #${client.shard.id}`;
        if (client.shard.id === 0) {
            // Load all the events/ announcements
            Bot.loadAllEvents();

            // Reload the patrons' goh data, and check for arena rank changes every minute
            if (Bot.config.premium) {
                setInterval(async () => {
                    // Check all the personal ranks   (To send to DMs)
                    await Bot.getRanks();

                    // Check all the ranks for shards (To send to channels)
                    await Bot.shardRanks();

                    // Only run the shard payout thing every 5min (on :5, :10, :15, etc)
                    const min = new Date().getMinutes();
                    if (min % 5 === 0) {
                        // Update the shard payout monitors
                        await Bot.shardTimes();
                    }
                }, 1 * 60 * 1000);
            }
        }

        // If it's the last shard being started, load all the emotes in
        if ((client.shard.id + 1) === client.shard.count) {
            Bot.logger.log("Loading up emotes");
            await client.shard.broadcastEval("this.loadAllEmotes()");
        }
    } else {
        await client.loadAllEmotes();
    }

    Bot.logger.log(readyString, "ready", true);

    // Sets the status as the current server count and help command
    const playingString =  `${Bot.config.prefix}help ~ swgohbot.com`;
    client.user.setPresence({ game: { name: playingString, type: 0 } }).catch(console.error);

    // Update the player/ guild count every 5 min
    setInterval(async () => {
        const dbo = await Bot.mongo.db(Bot.config.mongodb.swapidb);
        Bot.swgohPlayerCount = await dbo.collection("playerStats").find({}).count();
        Bot.swgohGuildCount  = await dbo.collection("guilds").find({}).count();
    }, 5 * 60 * 1000);
};
