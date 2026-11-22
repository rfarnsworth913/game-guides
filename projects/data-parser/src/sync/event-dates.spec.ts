import { describe, expect, it } from "vitest";
import { eventBoundary } from "@common/events/event-dates";
import { EVENT_SCHEDULES } from "@lib/constants/event-schedules.constants";
import { GAME_PROFILES } from "./game-profiles";
import { recurringEvents } from "./recurring-events";
import { EventType } from "@lib/enums/event-types.enum";

describe("shared event reset boundaries", () => {
    it("places a UTC server daily in the active cycle even when the viewer's local day differs", () => {
        const profile = GAME_PROFILES.find(game => game.id === "fgo")!;
        const now = new Date("2026-11-22T01:00:00Z");
        const daily = recurringEvents(profile, now).find(event => event.eventType === EventType.Daily)!;
        expect(eventBoundary(String(daily.startDate), false, daily.eventSchedule)!.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(eventBoundary(String(daily.endDate), true, daily.eventSchedule)!.getTime()).toBeGreaterThan(now.getTime());
    });
    it("ends the current cycle at the next server reset, using an exclusive boundary", () => {
        expect(eventBoundary("2026-11-21", false, EVENT_SCHEDULES["genshin"])?.toISOString()).toBe("2026-11-21T09:00:00.000Z");
        expect(eventBoundary("2026-11-21", true, EVENT_SCHEDULES["genshin"])?.toISOString()).toBe("2026-11-22T09:00:00.000Z");
        expect(EVENT_SCHEDULES["nte"].resetHour).toBe(5);
    });
    it("preserves timestamp instants and legacy local-calendar periods", () => {
        expect(eventBoundary("2026-11-21T04:00:00-05:00", true, EVENT_SCHEDULES["fgo"])?.toISOString()).toBe("2026-11-21T09:00:00.000Z");
        expect(eventBoundary("2026-11-21")).toEqual(new Date(2026, 10, 21));
        expect(eventBoundary("2026-11-21", true)).toEqual(new Date(2026, 10, 22));
        expect(eventBoundary("2026-02-30", false, EVENT_SCHEDULES["fgo"])).toBeNull();
        expect(eventBoundary("2026-11-21", false, {offsetMinutes: 0, resetHour: 24})).toBeNull();
    });
});
