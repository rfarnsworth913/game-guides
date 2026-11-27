import type { DashboardGame, DashboardLink, DashboardPlan } from '@lib/types/dashboard.type';
import type { GameSnapshot, PlayerState } from '@lib/types/workspace.type';
import { fromCatalog } from '@common/workspace/workspace';
import { canAccessFeature } from '@common/workspace/game-overview';
import { resolveCharacterReferences } from '@common/characters/character-story';
import { resolveEventReferences } from '@common/events/event-story';
import { sharedEventState } from '@common/events/event-progress';
import { inventoryItems, inventoryRequirementIssues, requirementStatus } from '@common/inventory/inventory-requirements';
import { hasCharacterGoal } from '@common/farming/farming';
import { characterDetailsTracks, trackGoalPercent } from '@common/characters/character-details';
import { guideUrl } from '@common/characters/characters';
import { hasProgress } from '@common/player/progress-activity';
import { storyDashboard, type StoryPosition } from './story-dashboard';
import { storyProgress } from './story-progress';

/** Apply the same canonical event/character references and personal progress as WorkspaceStore. */
export function dashboardEntries(snapshot: GameSnapshot, player: Record<string, PlayerState>) {
    const entries = resolveEventReferences(resolveCharacterReferences(snapshot.entries));
    const events = new Map(entries.filter(entry => entry.kind === 'events').map(entry => [entry.id,
        sharedEventState(entry, player[`${entry.game}/${entry.id}`], entries.filter(item => item.eventId === entry.id)
            .flatMap(item => player[`${item.game}/${item.id}`] ? [player[`${item.game}/${item.id}`]] : []))]));
    return entries.map(entry => fromCatalog(entry, events.get(entry.eventId ?? (entry.kind === 'events' ? entry.id : '')) ?? player[`${entry.game}/${entry.id}`]));
}

export function dashboardGame(snapshot: GameSnapshot, player: Record<string, PlayerState>, editor: boolean, position?: StoryPosition, version?: string): DashboardGame {
    const game = snapshot.overview!;
    const supports = (feature: string) => canAccessFeature(game, feature, editor);
    const entries = dashboardEntries(snapshot, player).filter(entry => supports(entry.kind === 'story-category' ? 'story' : entry.kind === 'achievement-category' ? 'achievements' : entry.kind));
    const result: DashboardGame = { game, hasProgress: entries.some(hasProgress) };
    const stories = entries.filter(entry => entry.kind === 'story');
    const storyLink = (entry: typeof entries[number]): DashboardLink => ({ id: entry.id, name: entry.name, section: entry.storySection,
        fragment: `story-template-${entry.id}`, ...storyProgress([entry]) });
    if (supports('story')) {
        const progress = storyDashboard(entries, game.gameId, position);
        result.story = { completed: progress.completed, total: progress.total, started: !!progress.visitedAt || progress.completed > 0, ...(progress.resume ? { resume: {
            ...storyLink(progress.resume), section: progress.section?.id, fragment: progress.fragment,
            name: progress.lastLocation || [progress.section?.name, progress.resume.name].filter(Boolean).join(' / '),
        } } : {}) };
        result.activities = stories.filter(entry => entry.category === 'endgame-activity' && !entry.eventId && !entry.eventSchedule).map(storyLink).filter(item => item.total > 0);
        const versionKey = (value: string) => value.trim().replace(/(?:\.0)+$/u, '');
        const patch = stories.filter(entry => entry.category === 'patch-overview' && (!version || versionKey(entry.patchOverview?.patchVersion ?? '') === versionKey(version))).sort((a, b) => b.order - a.order)[0];
        if (patch) {result.patch = storyLink(patch);}
    }
    if (supports('achievements')) {
        const achievements = entries.filter(entry => entry.kind === 'achievements');
        result.achievements = { total: achievements.length, completed: achievements.filter(entry => entry.completed).length };
        result.achievementCategories = [...new Set(achievements.map(entry => entry.category))].map(id => {
            const items = achievements.filter(entry => entry.category === id);
            return { id, name: entries.find(entry => entry.kind === 'achievement-category' && entry.id === id)?.name ?? (id || 'Achievements'),
                total: items.length, completed: items.filter(entry => entry.completed).length };
        }).sort((a, b) => Number(b.completed > 0 && b.completed < b.total) - Number(a.completed > 0 && a.completed < a.total) || a.name.localeCompare(b.name)).slice(0, 3);
    }
    const plans: DashboardPlan[] = [];
    if (supports('characters')) {
        const characters = entries.filter(entry => entry.kind === 'characters');
        const owned = characters.filter(entry => entry.characterCollection?.owned);
        const goalPercent = (entry: typeof owned[number]) => snapshot.characterRules && entry.characterCollection?.target ? trackGoalPercent(entry.characterCollection, entry.characterCollection.target,
            characterDetailsTracks(snapshot.characterRules, entry.characterDefinition)) : globalThis.undefined;
        result.characters = { total: characters.length, owned: owned.length, entries: owned.slice().sort((a, b) => Number(hasCharacterGoal(b.characterCollection)) - Number(hasCharacterGoal(a.characterCollection)) || a.name.localeCompare(b.name)).slice(0, 6).map(entry => ({
            id: entry.id, name: entry.name, icon: entry.characterDefinition?.headshot || entry.icon, level: snapshot.characterRules ? entry.characterCollection?.level : globalThis.undefined,
            hasGoal: hasCharacterGoal(entry.characterCollection), percent: goalPercent(entry),
        })) };
        for (const entry of owned.filter(entry => hasCharacterGoal(entry.characterCollection))) {
            plans.push({ id: entry.id, name: `${entry.name} progression`, gameId: game.gameId, feature: 'characters', icon: entry.characterDefinition?.headshot || entry.icon,
                target: `Level ${entry.characterCollection!.level} to ${entry.characterCollection!.target!.level}`,
                percent: snapshot.characterRules ? trackGoalPercent(entry.characterCollection!, entry.characterCollection!.target!,
                    characterDetailsTracks(snapshot.characterRules, entry.characterDefinition)) : 0 });
        }
    }
    if (supports('plans')) {
        for (const entry of entries.filter(item => item.kind === 'plans' && !item.completed)) {
            // Legacy plan definitions are shared; only plans with an explicit personal target are active personal goals.
            if (!player[`${entry.game}/${entry.id}`]?.target) {continue;}
            const amounts = entry.requirements.map(requirement => ({ need: requirement.amount,
                owned: entries.find(item => item.kind === 'inventory' && item.id === requirement.item)?.quantity ?? 0 }));
            const need = amounts.reduce((sum, item) => sum + item.need, 0);
            plans.push({ id: entry.id, name: entry.name, gameId: game.gameId, feature: 'plans',
                percent: need ? Math.round(amounts.reduce((sum, item) => sum + Math.min(item.need, item.owned), 0) / need * 100) : 0 });
        }
    }
    if (supports('plans') || supports('characters')) {result.planCount = plans.length; result.plans = plans.slice(0, 5);}
    result.resources = [...new Map(entries.filter(entry => entry.kind === 'characters').flatMap(entry => entry.characterDefinition?.guides ?? [])
        .filter(guide => guideUrl(guide.url)).map(guide => [guide.url, guide])).values()].slice(0, 5);
    if (supports('inventory') || supports('farming')) {
        const items = inventoryItems(entries, game.gameId, snapshot.characterRules);
        result.materialIssues = inventoryRequirementIssues(entries, game.gameId, snapshot.characterRules);
        const required = items.filter(item => item.required > 0);
        result.materials = { sufficient: required.filter(item => item.owned >= item.required).length,
            partial: required.filter(item => item.owned > 0 && item.owned < item.required).length, missing: required.filter(item => item.owned <= 0).length };
        if (supports('inventory')) {
            const count = (status: string) => items.filter(item => requirementStatus(item.owned, item.required) === status).length;
            result.inventory = { total: items.length, sufficient: count('sufficient'), partial: count('partial'), missing: count('missing'), notRequired: count('not-required') };
        }
        if (supports('farming')) {result.farming = items.filter(item => item.missing > 0).slice(0, 5).map(item => ({ id: item.item.id, name: item.item.name, missing: item.missing }));}
    }
    return result;
}
