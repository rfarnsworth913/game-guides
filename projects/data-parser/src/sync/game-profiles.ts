import { EVENT_SCHEDULES } from '@lib/constants/event-schedules.constants';
import { EventType } from "@lib/enums";
import type { GameProfile, Recurrence } from "./types";

const daily = (title: string, url: string): Recurrence => ({ title, url, cadence: "daily", eventType: EventType.Daily });
const weekly = (title: string, url: string): Recurrence => ({ title, url, cadence: "weekly", eventType: EventType.Weekly });
const monthly = (title: string, url: string, day = 1, eventType = EventType.Monthly): Recurrence => ({ title, url, day, cadence: "monthly", eventType });

// Fixed game-server offsets, deliberately independent of the machine's timezone/DST.
// Dates remain server-calendar dates, matching the current application's inclusive end-date model.
export const GAME_PROFILES: Array<GameProfile> = [
    {
        id: "endfield",
        name: "Arknights: Endfield",
        ...EVENT_SCHEDULES["endfield"],
        recurring: [
            daily("Stock Redistribution", "https://endfield.wiki.gg/wiki/Stock_Redistribution"),
            daily("Daily Routine", "https://endfield.wiki.gg/wiki/Operational_Manual#Daily"),
            daily("Stamina Spend", "https://endfield.wiki.gg/wiki/Sanity"),
            weekly("Weekly Routine", "https://endfield.wiki.gg/wiki/Operational_Manual#Weekly"),
        ]
    },
    {
        id: "fgo",
        name: "Fate Grand Order",
        ...EVENT_SCHEDULES["fgo"],
        recurring: [
            daily("Daily Quests", "https://fategrandorder.fandom.com/wiki/Daily_Event_Quests"),
            weekly("Weekly Master Missions", "https://fategrandorder.fandom.com/wiki/Master_Missions"),
            monthly("Da Vinci's Workshop", "https://fategrandorder.fandom.com/wiki/Da_Vinci%27s_Workshop"),
        ]
    },
    {
        id: "genshin",
        name: "Genshin Impact",
        ...EVENT_SCHEDULES["genshin"],
        recurring: [
            daily("Daily Commissions", "https://genshin-impact.fandom.com/wiki/Commission"),
            weekly("Trounce Domain", "https://genshin-impact.fandom.com/wiki/Trounce_Domain"),
            monthly("Paimon's Bargains", "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains"),
            monthly("Spiral Abyss", "https://genshin-impact.fandom.com/wiki/Spiral_Abyss", 16, EventType.EndGame),
            monthly("Imaginarium Theater", "https://genshin-impact.fandom.com/wiki/Imaginarium_Theater", 1, EventType.EndGame),
        ]
    },
    {
        id: "gf2",
        name: "Girls Frontline 2",
        ...EVENT_SCHEDULES["gf2"],
        recurring: [
            daily("Daily Missions", "https://iopwiki.com/wiki/GFL2_Main_Screen#Daily_Missions"),
            weekly("Weekly Missions", "https://iopwiki.com/wiki/GFL2_Main_Screen#Weekly_Missions"),
        ]
    },
    {
        id: "hsr",
        name: "Honkai Star Rail",
        ...EVENT_SCHEDULES["hsr"],
        recurring: [
            daily("Daily Training", "https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Daily_Training"),
            weekly("Echo of War", "https://honkai-star-rail.fandom.com/wiki/Echo_of_War"),
            { ...weekly("Currency Wars", "https://honkai-star-rail.fandom.com/wiki/Currency_Wars"), eventType: EventType.WeeklyLinked },
            { ...weekly("Simulated Universe", "https://honkai-star-rail.fandom.com/wiki/Simulated_Universe"), eventType: EventType.WeeklyLinked },
            monthly("Embers Exchange", "https://honkai-star-rail.fandom.com/wiki/Embers_Exchange"),
        ]
    },
    {
        id: "nte",
        name: "Neverness to Everness",
        ...EVENT_SCHEDULES["nte"],
        recurring: [
            daily("Daily Quests", "https://nte.perfectworld.com/en/index.html"),
            weekly("City Stamina", "https://nte.perfectworld.com/en/index.html"),
            weekly("Circle Bounty Weekly Quests", "https://nte.perfectworld.com/en/index.html"),
        ]
    },
    {
        id: "wuwa",
        name: "Wuthering Waves",
        ...EVENT_SCHEDULES["wuwa"],
        recurring: [
            daily("Daily Activities", "https://wutheringwaves.fandom.com/wiki/Guidebook/Activity"),
            weekly("Weekly Challenge", "https://wutheringwaves.fandom.com/wiki/Weekly_Challenge"),
            weekly("Fantasies of the Thousand Gateways", "https://wutheringwaves.fandom.com/wiki/Fantasies_of_the_Thousand_Gateways"),
            monthly("Shop Reset", "https://wutheringwaves.fandom.com/wiki/Store"),
        ]
    },
    {
        id: "zzz",
        name: "Zenless Zone Zero",
        ...EVENT_SCHEDULES["zzz"],
        recurring: [
            daily("Errands", "https://zenless-zone-zero.fandom.com/wiki/Compendium#Errands"),
            weekly("Notorious Hunt", "https://zenless-zone-zero.fandom.com/wiki/Notorious_Hunt"),
            weekly("Hollow Zero", "https://zenless-zone-zero.fandom.com/wiki/Hollow_Zero"),
            monthly("Signal Shop", "https://zenless-zone-zero.fandom.com/wiki/Signal_Shop"),
        ]
    },
];
