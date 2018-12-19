const Command = require("../base/Command");

class CommandName extends Command {
    constructor(client) {
        super(client, {
            name: "grandarena",
            category: "SWGoH",
            enabled: true, 
            aliases: ["ga"],
            permissions: ["EMBED_LINKS"],
            subArgs: {
                faction: {
                    aliases: ["fact", "f"]
                }
            }
        });
    }

    async run(client, message, [user1, user2, ...characters], options) { // eslint-disable-line no-unused-vars
        const problemArr = [];
        user1 = await super.getUser(message, user1, false);
        user2 = await super.getUser(message, user2, false);
        if (!user1) problemArr.push(message.language.get("COMMAND_GRANDARENA_INVALID_USER", 1)); 
        if (!user2) problemArr.push(message.language.get("COMMAND_GRANDARENA_INVALID_USER", 2)); 

        const charOut = [];
        if (characters.length) {
            characters = characters.join(" ").split("|").map(c => c.trim());
            for (const ix in characters) {
                let chars = client.findChar(characters[ix], client.characters);
                if (!chars.length) {
                    chars = client.findChar(characters[ix], client.ships, true);
                }
                if (!chars.length) {
                    problemArr.push(message.language.get("COMMAND_GRANDARENA_INVALID_CHAR", characters[ix]));
                } else {
                    // It only found at least one match
                    chars.forEach(c => {
                        charOut.push(c.uniqueName);
                    });
                }
            }
        }

        if (!problemArr.length) {
            // If there are no problems, go ahead and pull the users
            const cooldown = client.getPlayerCooldown(message.author.id);
            try {
                user1 = await client.swgohAPI.unitStats(user1, null, cooldown);
            } catch (e) {
                problemArr.push(e.message);
            }
            try {
                user2 = await client.swgohAPI.unitStats(user2, null, cooldown);
            } catch (e) {
                problemArr.push(e.message);
            }
            if (!problemArr.length) {
                // If there are no problems, continue
                const checkArr = {};

                // Localized labels for each row
                const labels = message.language.get("COMMAND_GRANDARENA_COMP_NAMES");

                // Set of default characters to show
                let charArr = [
                    "BASTILASHAN",
                    "BB8",
                    "COMMANDERLUKESKYWALKER",
                    "ENFYSNEST",
                    "GENERALKENOBI",
                    "GRANDMASTERYODA",
                    "HANSOLO",
                    "HERMITYODA",
                    "JEDIKNIGHTREVAN",
                    "R2D2_LEGENDARY",
                    "REYJEDITRAINING",
                    "BOSSK",
                    "DARTHSION",
                    "DARTHTRAYA",
                    "KYLORENUNMASKED",
                    "VEERS",
                    "EMPERORPALPATINE",
                    "MOTHERTALZIN",
                    "GRANDADMIRALTHRAWN",
                    "WAMPA"
                ];

                if (charOut.length) {
                    charArr = [...new Set(charOut)];
                }

                if (options.subArgs.faction) {
                    const fact = client.findFaction(options.subArgs.faction);
                    if (fact) {
                        charArr = charArr.concat(client.characters.filter(c => c.factions.find(ch => ch.toLowerCase() === fact)).map(c => c.uniqueName));
                    }
                }

                let overview = [];
                const shipList = client.ships.map(s => s.uniqueName);
                const charList = client.characters.map(c => c.uniqueName);

                overview.push({
                    check: labels.charGP,
                    user1: client.shortenNum(user1.stats.reduce((a, b) => a + (charList.indexOf(b.unit.defId) > -1 ? b.unit.gp : 0), 0)),
                    user2: client.shortenNum(user2.stats.reduce((a, b) => a + (charList.indexOf(b.unit.defId) > -1 ? b.unit.gp : 0), 0))
                });
                overview.push({
                    check: labels.shipGP,
                    user1: client.shortenNum(user1.stats.reduce((a, b) => a + (shipList.indexOf(b.unit.defId) > -1 ? b.unit.gp : 0), 0)),
                    user2: client.shortenNum(user2.stats.reduce((a, b) => a + (shipList.indexOf(b.unit.defId) > -1 ? b.unit.gp : 0), 0))
                });
                if (user1.arena && user2.arena) {
                    if (user1.arena.char && user2.arena.char) {
                        overview.push({
                            check: labels.cArena,
                            user1: user1.arena.char.rank,
                            user2: user2.arena.char.rank,
                        });
                    }
                    if (user1.arena.ship && user2.arena.ship) {
                        overview.push({
                            check: labels.sArena,
                            user1: user1.arena.ship.rank,
                            user2: user2.arena.ship.rank,
                        });
                    }
                }
                overview.push({
                    check: labels.zetas,
                    user1: user1.stats.reduce((a, b) => a + b.unit.skills.filter(s => s.tier === 8 && s.isZeta).length, 0),
                    user2: user2.stats.reduce((a, b) => a + b.unit.skills.filter(s => s.tier === 8 && s.isZeta).length, 0)
                });
                overview.push({
                    check: labels.star6,
                    user1: user1.stats.filter(c => c.unit.rarity === 6).length,
                    user2: user2.stats.filter(c => c.unit.rarity === 6).length
                });
                overview.push({
                    check: labels.star7,
                    user1: user1.stats.filter(c => c.unit.rarity === 7).length,
                    user2: user2.stats.filter(c => c.unit.rarity === 7).length
                });
                overview.push({
                    check: labels.g11,
                    user1: user1.stats.filter(c => c.unit.gear === 11).length,
                    user2: user2.stats.filter(c => c.unit.gear === 11).length
                });
                overview.push({
                    check: labels.g12,
                    user1: user1.stats.filter(c => c.unit.gear === 12).length,
                    user2: user2.stats.filter(c => c.unit.gear === 12).length
                });

                overview = client.codeBlock(client.makeTable({
                    check: {value: "", align: "left", endWith: "::"},
                    user1: {value: "", endWith: "vs", align: "right"},
                    user2: {value: "", align: "left"}
                }, overview, {useHeader: false}).join("\n"), "asciiDoc");

                const u1Mods = {
                    spd10: 0,
                    spd15: 0,
                    spd20: 0,
                    off100: 0
                };
                const u2Mods = {
                    spd10: 0,
                    spd15: 0,
                    spd20: 0,
                    off100: 0
                };
                user1.stats.forEach(c => {
                    if (c.unit.mods) {
                        c.unit.mods.forEach(m => {
                            // 5 is the number for speed, 41 is for offense
                            const spd = m.secondaryStat.find(s => s.unitStat === 5 && s.value >= 10);
                            const off = m.secondaryStat.find(s => s.unitStat === 41 && s.value >= 100);
                            if (spd) {
                                if (spd.value >= 20) {
                                    u1Mods.spd20 += 1;
                                } else if (spd.value >= 15) {
                                    u1Mods.spd15 += 1;
                                } else {
                                    u1Mods.spd10 += 1;
                                }
                            }
                            if (off) u1Mods.off100 += 1;
                        });
                    }
                });
                user2.stats.forEach(c => {
                    if (c.unit.mods) {
                        c.unit.mods.forEach(m => {
                            const spd = m.secondaryStat.find(s => s.unitStat === 5 && s.value >= 10);
                            const off = m.secondaryStat.find(s => s.unitStat === 41 && s.value >= 100);
                            if (spd) {
                                if (spd.value >= 20) {
                                    u2Mods.spd20 += 1;
                                } else if (spd.value >= 15) {
                                    u2Mods.spd15 += 1;
                                } else {
                                    u2Mods.spd10 += 1;
                                }
                            }
                            if (off) u2Mods.off100 += 1;
                        });
                    }
                });

                let modOverview = [];
                modOverview.push({
                    check: labels.mods6,
                    user1: user1.stats.reduce((a, b) => a + (b.unit.mods ? b.unit.mods.filter(m => m.pips === 6).length : 0), 0),
                    user2: user2.stats.reduce((a, b) => a + (b.unit.mods ? b.unit.mods.filter(m => m.pips === 6).length : 0), 0)
                });
                modOverview.push({
                    check: labels.spd10,
                    user1: u1Mods.spd10,
                    user2: u2Mods.spd10
                });
                modOverview.push({
                    check: labels.spd15,
                    user1: u1Mods.spd15,
                    user2: u2Mods.spd15
                });
                modOverview.push({
                    check: labels.spd20,
                    user1: u1Mods.spd20,
                    user2: u2Mods.spd20
                });
                modOverview.push({
                    check: labels.off100,
                    user1: u1Mods.off100,
                    user2: u2Mods.off100
                });

                modOverview = client.codeBlock(client.makeTable({
                    check: {value: "", align: "left", endWith: "::"},
                    user1: {value: "", endWith: "vs", align: "right"},
                    user2: {value: "", align: "left"}
                }, modOverview, {useHeader: false}).join("\n"), "asciiDoc");


                for (const char of charArr) {
                    const user1Char = user1.stats.find(c => c.unit.defId === char);
                    const user2Char = user2.stats.find(c => c.unit.defId === char);
                    let cName = client.characters.find(c => c.uniqueName === char);
                    let ship = false;

                    if (!cName) {
                        // See if you can get it from the ships
                        if (client.ships.find(s => s.uniqueName === char)) {
                            cName = client.ships.find(s => s.uniqueName === char).name;
                            ship = true;
                        } else {
                            continue;
                        }
                    } else {
                        cName = cName.name;
                    }

                    checkArr[cName] = [];

                    // Put in the header/ name
                    checkArr[cName].push({
                        check: labels.level,
                        user1: user1Char ? user1Char.unit.level : "N/A",
                        user2: user2Char ? user2Char.unit.level : "N/A"
                    });
                    checkArr[cName].push({
                        check: labels.gearLvl,
                        user1: user1Char ? user1Char.unit.gear + `${user1Char.unit.equipped.length ? "+" + user1Char.unit.equipped.length : ""}` : "N/A",
                        user2: user2Char ? user2Char.unit.gear + `${user2Char.unit.equipped.length ? "+" + user2Char.unit.equipped.length : ""}` : "N/A"
                    });
                    checkArr[cName].push({
                        check: labels.starLvl,
                        user1: user1Char ? user1Char.unit.rarity : "N/A",
                        user2: user2Char ? user2Char.unit.rarity : "N/A"
                    });

                    if (!ship) {
                        checkArr[cName].push({
                            check: labels.zetas,
                            user1: user1Char ? user1Char.unit.skills.filter(s => s.tier === 8 && s.isZeta).length.toString() : "N/A",
                            user2: user2Char ? user2Char.unit.skills.filter(s => s.tier === 8 && s.isZeta).length.toString() : "N/A"
                        });
                        checkArr[cName].push({
                            check: labels.speed,
                            user1: user1Char ? user1Char.stats.final.Speed : "N/A",
                            user2: user2Char ? user2Char.stats.final.Speed : "N/A"
                        });
                    }
                }

                let extra = 0;
                const fields = [];
                Object.keys(checkArr).forEach((c, ix) => {
                    if (ix < 20) {
                        fields.push({
                            name: c,
                            value: "`==================================`\n" + client.codeBlock(client.makeTable({
                                check: {value: "", align: "left", endWith: "::"},
                                user1: {value: "", endWith: "vs", align: "right"},
                                user2: {value: "", align: "left"}
                            }, checkArr[c], {useHeader: false}).join("\n"), "asciiDoc"),
                            inline: true
                        });
                    } else {
                        extra++;
                    }
                });
                if (extra > 0) {
                    fields.push({
                        name: message.language.get("COMMAND_GRANDARENA_EXTRAS_HEADER"),
                        value: message.language.get("COMMAND_GRANDARENA_EXTRAS", extra)
                    });
                }

                const footer = client.updatedFooter(Math.min(user1.updated, user2.updated), message, "player", cooldown);
                return message.channel.send({embed: {
                    author: {name: message.language.get("COMMAND_GRANDARENA_OUT_HEADER", user1.stats[0].unit.player, user2.stats[0].unit.player)},
                    description: message.language.get("COMMAND_GRANDARENA_OUT_DESC", overview, modOverview),
                    fields: fields,
                    footer: footer
                }});
            }
        }
        if (problemArr.length) {
            // Otherwise, spit out the list of issues
            return message.channel.send({embed: {
                author: {name: "Error"},
                description: client.codeBlock(problemArr.map(p => "* " + p).join("\n"))
            }});
        }

    }
}

module.exports = CommandName;

