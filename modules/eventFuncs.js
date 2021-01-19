const momentTZ = require("moment-timezone");
require("moment-duration-format");

module.exports = (Bot, client) => {
    // The scheduler for events
    Bot.schedule = require("node-schedule");

    // Send older events that were missed in the past
    async function sendOldEvents(event, guildConf) {
        const lang = Bot.languages[guildConf.language] || Bot.languages["en_US"];
        let eventName = event.eventID.split("-");
        const guildID = eventName.splice(0, 1)[0];
        eventName = eventName.join("-");

        // Alert them that it was skipped with a note
        const announceMessage = `**${eventName}**\n${event.eventMessage} \n\n${Bot.codeBlock(lang.get("BASE_EVENT_LATE"))}`;
        if (guildConf["announceChan"] != "" || event.eventChan !== "") {
            if (event["eventChan"] && event.eventChan !== "") { // If they've set a channel, use it
                try {
                    const g = await client.guilds.cache.get(guildID);
                    Bot.announceMsg(g, announceMessage, event.eventChan, guildConf);
                } catch (e) {
                    Bot.logger.error("Broke trying to announce event with ID: ${ev.eventID} \n${e}");
                }
            } else { // Else, use the default one from their settings
                const g = await client.guilds.cache.get(guildID);
                Bot.announceMsg(g, announceMessage, null, guildConf);
            }
        }
    }

    // Simulate old events
    async function simulateEvent(event, nowTime, guildConf) {
        const tmpEv = await reCalc(event, nowTime);
        if (tmpEv) {
            // Got a viable next time, so set it and move on
            event.eventDT    = tmpEv.eventDT;
            event.repeatDays = tmpEv.repeatDays;
            event.repeat     = tmpEv.repeat;
            // Save it back with the new values
            await Bot.database.models.eventDBs.update(event, {where: {eventID: event.eventID}})
                .then(() => {
                    Bot.scheduleEvent(event, guildConf.eventCountdown);
                });
        } else {
            // There was no viable next time, so wipe it out
            await Bot.database.models.eventDBs.destroy({where: {eventID: event.eventID}})
                .catch(error => { Bot.logger.error(`Broke trying to delete zombies ${error}`); });
        }
    }

    // Re-caclulate a viable eventDT, and return the updated event
    async function reCalc(ev, nowTime) {
        if (!nowTime) nowTime = momentTZ().unix() * 1000;  // In case it doesn't get passed in... Looking at you announcer
        if (ev.repeatDays.length > 0) { // repeatDays is an array of days to skip
            // If it's got repeatDays set up, splice the next time, and if it runs out of times, return null
            while (nowTime > ev.eventDT && ev.repeatDays.length > 0) {
                const days = ev.repeatDays.splice(0, 1)[0];
                ev.eventDT = momentTZ(parseInt(ev.eventDT, 10)).add(parseInt(days, 10), "d").unix()*1000;
            }
            if (nowTime > ev.eventDT) { // It ran out of days
                return null;
            }
        } else { // 0d0h0m
            // Else it's using basic repeat
            while (nowTime >= ev.eventDT) {
                ev.eventDT = momentTZ(parseInt(ev.eventDT, 10)).add(ev.repeat.repeatDay, "d").add(ev.repeat.repeatHour, "h").add(ev.repeat.repeatMin, "m").unix()*1000;
            }
        }
        return ev;
    }

    // BroadcastEval a message send
    async function sendMsg(event, guildConf, guildID, announceMessage) {
        if (guildConf.announceChan !== "" || event.eventChan !== "") {
            let chan = "";
            if (event?.eventChan !== "") { // If they've set a channel, use it
                chan = event.eventChan;
            }
            try {
                await client.shard.broadcastEval(`
                    (async () => {
                        const targetGuild = this.guilds.cache.find(g => g.id === "${guildID}");
                        if (targetGuild) {
                            (${Bot.announceMsg})(targetGuild, \`${announceMessage}\`, "${chan}", ${JSON.stringify(guildConf)})
                        }
                    })();
                `);
            } catch (e) {
                Bot.logger.error(`Broke trying to announce event with ID: ${event.eventID} \n${e.stack}`);
            }
        }
    }

    // Loaad all the events into the scheduler and such
    Bot.loadAllEvents = async () => {
        let ix = 0;
        const nowTime = momentTZ().unix() * 1000;                       // The current time of it running
        const oldTime = momentTZ().subtract(20, "m").unix() * 1000;     // 20 min ago, don't try again if older than this
        const events = await Bot.database.models.eventDBs.findAll();

        if (events.length > 0) {
            // for (let i = 0; i < eventList.length; i++ ) {
            for (const event of events) {
                let eventName = event.eventID.split("-");
                const guildID = eventName.splice(0, 1)[0];
                eventName = eventName.join("-");
                const guildConf = await Bot.getGuildConf(guildID);
                // If it's past when it was supposed to announce
                if (event.eventDT < nowTime) {
                    // If it's been skipped over somehow (probably bot reboot or discord connection issue)
                    if (event.eventDT > oldTime) {
                        // If it's barely missed the time (within 20min), then send it late, but with a
                        // note about it being late, then re-schedule if needed
                        await sendOldEvents(event, guildConf);
                    }
                    if (event.repeatDays.length || (event.repeat.repeatDay || event.repeat.repeatHour || event.repeat.repeatMin)) {
                        // If it's got a repeat set up, simulate it/ find the next viable time then re-set it in the future/ wipe the old one
                        await simulateEvent(event, nowTime, guildConf);
                    } else {
                        // If it's not set to repeat and it's long-gone, just wipe it from existence
                        await Bot.database.models.eventDBs.destroy({where: {eventID: event.eventID}})
                            .catch(error => { Bot.logger.error(`Broke trying to delete zombies ${error}`); });
                    }
                } else {
                    ix++;
                    Bot.scheduleEvent(event, guildConf.eventCountdown);
                }
            }
        }
        Bot.logger.log(`Loaded ${ix} events`);
    };

    // Actually schedule em here
    Bot.scheduleEvent = async (event, countdown) => {
        if (Object.keys(Bot.schedule.scheduledJobs).indexOf(event.eventID) > -1) {
            return;
        }
        Bot.schedule.scheduleJob(event.eventID, parseInt(event.eventDT, 10), function() {
            Bot.eventAnnounce(event);
        });

        if (countdown.length && (event.countdown === "true" || event.countdown === "yes" || event.countdown === true)) {
            const timesToCountdown = countdown;
            const nowTime = momentTZ().unix() * 1000;
            timesToCountdown.forEach(time => {
                const cdTime  = time * 60;
                const evTime  = event.eventDT / 1000;
                const newTime = (evTime-cdTime-60) * 1000;
                if (newTime > nowTime) {    // If the countdown is between now and the event
                    const sID = `${event.eventID}-CD${time}`;
                    if (!Bot.evCountdowns[event.eventID]) {
                        Bot.evCountdowns[event.eventID] = [sID];
                    } else {
                        Bot.evCountdowns[event.eventID].push(sID);
                    }
                    Bot.schedule.scheduleJob(sID, parseInt(newTime, 10) , function() {
                        Bot.countdownAnnounce(event);
                    });
                }
            });
        }
    };

    // Delete em here as needed
    Bot.deleteEvent = async (eventID) => {
        const event = await Bot.database.models.eventDBs.findOne({where: {eventID: eventID}});

        await Bot.database.models.eventDBs.destroy({where: {eventID: eventID}})
            .then(() => {
                const eventToDel = Bot.schedule.scheduledJobs[eventID];
                if (!eventToDel) {
                    Bot.logger.error("Could not find scheduled event to delete: " + event);
                } else {
                    eventToDel.cancel();
                }
            })
            .catch(error => {
                Bot.logger.error(`Broke deleting an event ${error}`);
            });

        if (Bot.evCountdowns[event.eventID] && (event.countdown === "true" || event.countdown === "yes")) {
            Bot.evCountdowns[event.eventID].forEach(time => {
                const eventToDel = Bot.schedule.scheduledJobs[time];
                if (eventToDel) {
                    eventToDel.cancel();
                }
            });
        }
    };

    // To stick into node-schedule for each countdown event
    Bot.countdownAnnounce = async (event) => {
        let eventName = event.eventID.split("-");
        const guildID = eventName.splice(0, 1)[0];
        eventName = eventName.join("-");

        const guildConf = await Bot.getGuildConf(guildID);

        var timeToGo = momentTZ.duration(momentTZ().diff(momentTZ(parseInt(event.eventDT, 10)), "minutes") * -1, "minutes").format(`h [${Bot.languages[guildConf.language].getTime("HOUR", "SHORT_SING")}], m [${Bot.languages[guildConf.language].getTime("MINUTE", "SHORT_SING")}]`);
        var announceMessage = Bot.languages[guildConf.language].get("BASE_EVENT_STARTING_IN_MSG", eventName, timeToGo);

        await sendMsg(event, guildConf, guildID, announceMessage);
    };

    // To stick into node-schedule for each full event
    Bot.eventAnnounce = async (event) => {
        // Parse out the eventName and guildName from the ID
        let eventName = event.eventID.split("-");
        const guildID = eventName.splice(0, 1)[0];
        eventName = eventName.join("-");

        const guildConf = await Bot.getGuildConf(guildID);

        let repTime = false, repDay = false;
        let newEvent = null;
        const repDays = event.repeatDays;

        if (event.countdown === "yes") {
            event.countdown = "true";
        } else if (event.countdown === "no") {
            event.countdown = "false";
        }

        // Announce the event
        var announceMessage = `**${eventName}**\n${event.eventMessage}`;
        sendMsg(event, guildConf, guildID, announceMessage);

        // If it's got any left in repeatDays
        if (repDays.length > 0) {
            repDay = true;
            let eventMsg = event.eventMessage;
            // If this is the last time, tack a message to the end to let them know it's the last one
            if (repDays.length === 1) {
                eventMsg += Bot.languages[guildConf.language].get("BASE_LAST_EVENT_NOTIFICATION");
            }
            newEvent = {
                "eventID": event.eventID,
                "eventDT": (momentTZ(parseInt(event.eventDT, 10)).add(parseInt(repDays.splice(0, 1), 10), "d").unix()*1000),
                "eventMessage": eventMsg,
                "eventChan": event.eventChan,
                "countdown": event.countdown,
                "repeat": {
                    "repeatDay": 0,
                    "repeatHour": 0,
                    "repeatMin": 0
                },
                "repeatDays": repDays
            };
            // Else if it's set to repeat
        } else if (event["repeat"] && (event.repeat["repeatDay"] !== 0 || event.repeat["repeatHour"] !== 0 || event.repeat["repeatMin"] !== 0)) { // At least one of em is more than 0
            repTime = true;
            newEvent = await reCalc(event, (momentTZ().unix() * 1000));
        }

        if (repTime || repDay) {
            // If it's set to repeat, set it for it's next cycle
            await Bot.database.models.eventDBs.update(newEvent, {where: {eventID: event.eventID}})
                .then(async () => {
                    const eventToDel = Bot.schedule.scheduledJobs[event.eventID];
                    if (eventToDel) {
                        eventToDel.cancel();
                    }
                    Bot.scheduleEvent(newEvent, guildConf.eventCountdown);
                })
                .catch(error => { Bot.logger.error(`Broke trying to replace event: ${error}`); });
        } else {
            // If it's not set to repeat at all, remove it it
            await Bot.database.models.eventDBs.destroy({where: {eventID: event.eventID}})
                .then(async () => {})
                .catch(error => { Bot.logger.error(`Broke trying to delete old event ${error}`); });
        }
    };
};
