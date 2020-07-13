const Command = require("../base/Command");

class ArenaWatch extends Command {
    constructor(Bot) {
        super(Bot, {
            name: "arenawatch",
            category: "Patreon",
            aliases: ["aw"],
            permissions: ["EMBED_LINKS"],
            flags: {},
            subArgs: {}
        });
    }

    async run(Bot, message, [target, ...args], options) { // eslint-disable-line no-unused-vars
        const onVar = ["true", "on", "enable"];
        const offVar = ["false", "off", "disable"];

        const outLog = [];

        if (target) target = target.toLowerCase();

        let userID = message.author.id;

        if (options.subArgs.user && options.level < 9) {
            return super.error(message, message.language.get("COMMAND_USERCONF_CANNOT_VIEW_OTHER"));
        } else if (options.subArgs.user) {
            userID = options.subArgs.user.replace(/[^\d]*/g, "");
            if (!Bot.isUserID(userID)) {
                return super.error(message, "Invalid user ID");
            }
        }

        const user = await Bot.userReg.getUser(userID); // eslint-disable-line no-unused-vars
        if (!user) {
            return super.error(message, "Sorry, but something went wrong and I couldn't find your data. Please try again.");
        }

        // ArenaWatch -> activate/ deactivate
        const pat = await Bot.getPatronUser(message.author.id);
        if (!pat || pat.amount_cents < 100) {
            return super.error(message, message.language.get("COMMAND_ARENAALERT_PATREON_ONLY"));
        }

        let codeCap = 0;
        if (pat.amount_cents < 500  ) {
            codeCap = Bot.config.arenaWatchConfig.tier1;
        } else if (pat.amount_cents < 1000 ) {
            codeCap = Bot.config.arenaWatchConfig.tier2;
        } else if (pat.amount_cents >= 1000) {
            codeCap = Bot.config.arenaWatchConfig.tier3;
        }

        if (!user.arenaWatch) {
            user.arenaWatch = {
                enabled: false,
                channel: null,
                arena: "char",
                allycodes: []
            };
        }

        switch (target) {
            case "enable":
            case "enabled": {
                if (!args.length) {
                    // They didn't say which way, so just toggle it
                    user.arenaWatch.enabled = !user.arenaWatch.enabled;
                } else {
                    const toggle = args[0];
                    if (onVar.indexOf(toggle) > -1) {
                        // Turn it on
                        user.arenaWatch.enabled = true;
                    } else if (offVar.indexOf(toggle) > -1) {
                        // Turn it off
                        user.arenaWatch.enabled = false;
                    } else {
                        // Complain, they didn't supply a proper toggle
                        return super.error(message, message.language.get("COMMAND_ARENAALERT_INVALID_BOOL"));
                    }
                }
                break;
            }
            case "ch":
            case "channel": {
                // This needs to make sure the person has an adminrole or something so they cannot just spam a chat with it
                let channel;
                [channel, ...args] = args;
                if (!channel) {
                    if (user.channel && user.channel.length) {
                        user.channel = null;
                    } else {
                        return super.error(message, "Missing channel");
                    }
                }
                if (!Bot.isChannelMention(channel)) super.error(message, "Invalid channel");

                channel = channel.replace (/[^\d]/g, "");
                if (!message.guild.channels.cache.get(channel)) super.error(message, "I cannot find that channel here.");

                // If it gets this far, it should be a valid code
                // Need to make sure that the user has the correct permissions to set this up
                if (options.level < 3) {
                    return super.error(message, message.language.get("COMMAND_ARENAWATCH_MISSING_PERM"));
                }

                // They got throught all that, go ahead and set it
                user.arenaWatch.channel = channel;
                break;
            }
            case "arena": {
                const setting = args[0];
                if (!setting) {
                    return super.error(message, message.language.get("COMMAND_USERCONF_ARENA_MISSING_ARENA"));
                } else if (!["char", "fleet", "both", "none"].includes(setting)) {
                    return super.error(message, message.language.get("COMMAND_USERCONF_ARENA_INVALID_ARENA"));
                }
                user.arenaWatch.arena = setting;
                break;
            }
            case "ac":
            case "allycode":
            case "allycodes": {
                // Should have add and remove here
                let code;
                const [action] = args;
                [ , code, ...args] = args;

                // Bunch of checks before getting to the logic
                if (!action)                             return super.error(message, message.language.get("COMMAND_ARENAWATCH_MISSING_ACTION"));
                if (!["add", "remove"].includes(action)) return super.error(message, message.language.get("COMMAND_ARENAWATCH_INVALID_ACTION"));
                if (!code)                               return super.error(message, message.language.get("COMMAND_ARENAWATCH_MISSING_AC", action));
                if (!Bot.isAllyCode(code))               return super.error(message, message.language.get("COMMAND_ARENAWATCH_INVALID_AC"));

                // Logic for add/ remove
                if (action === "add") {
                    let codes;
                    if (args.length) {
                        code = [code, ...args].join(",");
                    }
                    if (code.indexOf(",") > -1) {
                        codes = code.split(",").map(c => c.replace(/[^0-9]/g, "")).filter(c => c.trim().length === 9).map(c => parseInt(c));
                    } else {
                        code = code.replace(/[^\d]/g, "");
                        if (code.length != 9) {
                            return super.error(message, `Invalid code, there are ${code.length}/9 digits`);
                        } else {
                            code = parseInt(code);
                        }
                    }
                    if (!codes || !codes.length) {
                        // Add the new code to the list
                        if (user.arenaWatch.allycodes.find(usercode => usercode.allyCode === code)) {
                            return message.channel.send("That ally code has already been added");
                        }
                        if (user.arenaWatch.allycodes.length >= codeCap) {
                            return super.error(message, message.language.get("COMMAND_ARENAWATCH_AC_CAP", code));
                        }

                        const player = await Bot.swgohAPI.unitStats(code);
                        if (!player) {
                            return super.error(message, code + " does not seem to be a valid ally code");
                        }

                        user.arenaWatch.allycodes.push({
                            allyCode: code,
                            name:     player.name,
                            mention:  null,
                            lastChar: player.arena.char ? player.arena.char.rank : null,
                            lastShip: player.arena.ship ? player.arena.ship.rank : null
                        });
                        outLog.push(code + " added!");
                    } else {
                        // There are more than one valid code, try adding them all
                        const players = await Bot.swgohAPI.unitStats(codes);
                        for (const c of codes) {
                            const player = players.find(p => p.allyCode === c);
                            if (user.arenaWatch.allycodes.find(usercode => usercode.allyCode === c)) {
                                outLog.push(`${c} was already in the list`);
                                continue;
                            }
                            if (!player) {
                                outLog.push(`Could not find ${c}, invalid code`);
                                continue;
                            }
                            if (user.arenaWatch.allycodes.length >= codeCap) {
                                outLog.push(`Could not add ${c}, ally code cap reached!`);
                                continue;
                            }
                            user.arenaWatch.allycodes.push({
                                allyCode: c,
                                name:     player.name,
                                mention:  null,
                                lastChar: player.arena.char ? player.arena.char.rank : null,
                                lastShip: player.arena.ship ? player.arena.ship.rank : null
                            });
                            outLog.push(c + " added!");
                        }
                    }
                } else if (["remove", "delete"].includes(action)) {
                    // Remove an ally code to the list
                    code = code.replace(/[^\d]/g, "");
                    if (code.length != 9) {
                        return super.error(message, `Invalid code, there are ${code.length}/9 digits`);
                    }
                    if (user.arenaWatch.allycodes.filter(ac => ac.allyCode === code || ac.allyCode === parseInt(code)).length) {
                        user.arenaWatch.allycodes = user.arenaWatch.allycodes.filter(ac => ac.allyCode !== code && ac.allyCode !== parseInt(code));
                        outLog.push(code + " has been removed");
                    } else {
                        return super.error(message, "That ally code was not available to remove");
                    }
                } else {
                    // Something weird happened?
                    return super.error(message, message.language.get("BASE_SOMETHING_WEIRD"));
                }
                break;
            }
            case "view": {
                // Show the current settings for this (Also maybe in ;uc, but a summarized version?)
                let chan;
                if (user.arenaWatch.channel) {
                    chan = message.guild ? message.guild.channels.cache.get(user.arenaWatch.channel) : null;
                    if (!chan) {
                        chan = await message.client.shard.broadcastEval(`
                                this.channels.cache.get('${user.arenaWatch.channel}');
                            `).then((thisChan) => chan = `<#${thisChan.filter(a => !!a)[0].id}>`);
                    }
                }
                return message.channel.send({embed: {
                    title: "Arena Watch Settings",
                    description: [
                        `Enabled:  **${user.arenaWatch.enabled ? "ON" : "OFF"}**`,
                        `Channel:  **${user.arenaWatch.channel ? chan : "N/A"}**`,
                        `Arena:    **${user.arenaWatch.arena}**`,
                        `AllyCodes: (${user.arenaWatch.allycodes.length}/${codeCap}) ${user.arenaWatch.allycodes.length ? "\n" + user.arenaWatch.allycodes.sort((a,b) => a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1).map(a => `\`${a.allyCode}\` **${a.name ? a.name : ""}**`).join("\n") : "**N/A**"}`
                    ].join("\n")
                }});
            }
            default:
                return super.error(message, message.language.get("COMMAND_ARENAWATCH_INVALID_OPTION"));
        }
        if (target !== "view") {
            await Bot.userReg.updateUser(userID, user);
        }
        return super.error(message, outLog.length ? outLog.join("\n") : message.language.get("COMMAND_ARENAALERT_UPDATED"), {title: " ", color: "#0000FF"});
    }
}

module.exports = ArenaWatch;
