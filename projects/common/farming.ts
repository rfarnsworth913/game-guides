import type { CharacterCollection, CharacterDefinition } from './characters';
import type { Entry } from './workspace';
import type { FarmingConfig, FarmingServer, FarmingSource, UpgradeRecipe } from './farming-config';

export type CostIssue = { characterId: string; message: string };
export type CharacterCost = { costs: Map<string, number>; issues: string[] };
const gearChanged = (collection: CharacterCollection) =>
    [
        ...new Set([
            ...Object.keys(collection.gear),
            ...Object.keys(collection.target?.gear ?? {}),
        ]),
    ].some(
        (key) =>
            JSON.stringify(collection.gear[key] ?? []) !==
            JSON.stringify(collection.target?.gear[key] ?? []),
    );
export function hasCharacterGoal(collection?: CharacterCollection): boolean {
    const target = collection?.target;
    if (!collection || !target) {return false;}
    return (
        target.level !== collection.level ||
        (target.ascensionRank ?? 0) !== (collection.ascensionRank ?? 0) ||
        [
            ...new Set([
                ...Object.keys(target.skillLevels ?? {}),
                ...Object.keys(collection.skillLevels ?? {}),
            ]),
        ].some(
            (key) => (target.skillLevels?.[key] ?? 1) !== (collection.skillLevels?.[key] ?? 1),
        ) ||
        [
            ...new Set([
                ...Object.keys(target.progression),
                ...Object.keys(collection.progression),
            ]),
        ].some((key) => (target.progression[key] ?? 0) !== (collection.progression[key] ?? 0)) ||
        gearChanged(collection)
    );
}
/** Sum only the unconsumed transitions. An explicit empty recipe represents a verified free step. */
export function characterCosts(
    definition: CharacterDefinition | undefined,
    collection: CharacterCollection | undefined,
): CharacterCost {
    const costs = new Map<string, number>(),
        issues: string[] = [];
    if (!collection?.target) {return { costs, issues: ['No development goal set.'] };}
    const target = collection.target;
    const recipes = new Map(
        (definition?.recipes ?? []).map((recipe) => [
            `${recipe.kind}:${recipe.key ?? ''}:${recipe.from}`,
            recipe,
        ]),
    );
    const add = (
        kind: UpgradeRecipe['kind'],
        key: string,
        current: number,
        goal: number,
        label: string,
    ) => {
        if (
            !Number.isSafeInteger(current) ||
            !Number.isSafeInteger(goal) ||
            goal < current ||
            goal > 1000 ||
            current < 0
        ) {
            issues.push(`${label}: invalid current/target values.`);
            return;
        }
        let missing = 0;
        for (let from = current; from < goal; from++) {
            const recipe = recipes.get(`${kind}:${key ?? ''}:${from}`);
            if (!recipe) {
                missing++;
                continue;
            }
            recipe.materials.forEach((cost) =>
                costs.set(cost.item, (costs.get(cost.item) ?? 0) + cost.amount),
            );
        }
        if (missing)
            {issues.push(
                `${label}: ${missing} upgrade transition${
                    missing === 1 ? '' : 's'
                } missing recipes.`,
            );}
    };
    add('level', '', collection.level, target.level, 'Character level');
    add(
        'ascension',
        '',
        collection.ascensionRank ?? 0,
        target.ascensionRank ?? 0,
        'Ascension',
    );
    const skills = new Map([
        ...(definition?.skills ?? []).map(
            (skill, index) => [skill.id ?? `skill-${index}`, skill.name] as const,
        ),
        ...(definition?.passiveSkills ?? []).map(
            (skill, index) => [skill.id ?? `passive-${index}`, skill.name] as const,
        ),
    ]);
    for (const key of new Set([
        ...Object.keys(collection.skillLevels ?? {}),
        ...Object.keys(target.skillLevels ?? {}),
    ])) {
        if (!skills.has(key)) {
            issues.push('A saved skill is no longer defined for this character.');
            continue;
        }
        add(
            'skill',
            key,
            collection.skillLevels?.[key] ?? 1,
            target.skillLevels?.[key] ?? 1,
            skills.get(key) ?? 'Skill',
        );
    }
    for (const key of new Set([
        ...Object.keys(collection.progression),
        ...Object.keys(target.progression),
    ]))
        {add(
            'progression',
            key,
            collection.progression[key] ?? 0,
            target.progression[key] ?? 0,
            key,
        );}
    if (gearChanged(collection))
        {issues.push('Equipment goals do not yet have numeric upgrade recipes.');}
    return { costs, issues };
}
export type FarmingMaterial = {
    item: Entry;
    required: number;
    owned: number;
    missing: number;
    characters: string[];
    plans: string[];
};
export function farmingRequirements(
    entries: Entry[],
    game: string,
    selected: string[],
    mode: 'characters' | 'plans',
    includeUnassigned = false,
): { materials: FarmingMaterial[]; issues: CostIssue[] } {
    const totals = new Map<
        string,
        { required: number; characters: Set<string>; plans: Set<string> }
    >();
    const issues: CostIssue[] = [];
    const add = (id: string, amount: number, characters: string[], plans: string[]) => {
        const row = totals.get(id) ?? {
            required: 0,
            characters: new Set<string>(),
            plans: new Set<string>(),
        };
        row.required += amount;
        characters.forEach((character) => row.characters.add(character));
        plans.forEach((plan) => row.plans.add(plan));
        totals.set(id, row);
    };
    if (mode === 'characters') {
        for (const character of entries.filter(
            (entry) =>
                entry.game === game &&
                entry.kind === 'characters' &&
                entry.characterCollection?.owned &&
                selected.includes(entry.id),
        )) {
            const result = characterCosts(
                character.characterDefinition,
                character.characterCollection,
            );
            result.costs.forEach((amount, id) => add(id, amount, [character.id], []));
            result.issues.forEach((message) => issues.push({ characterId: character.id, message }));
        }
    } else {
        for (const plan of entries.filter(
            (entry) => entry.game === game && entry.kind === 'plans' && !entry.completed,
        )) {
            const members = plan.members.filter((id) => selected.includes(id));
            if (!members.length && !(includeUnassigned && !plan.members.length)) {continue;}
            plan.requirements.forEach((cost) => add(cost.item, cost.amount, members, [plan.name]));
        }
    }
    const items = new Map(
        entries
            .filter((entry) => entry.game === game && entry.kind === 'inventory')
            .map((entry) => [entry.id, entry]),
    );
    const materials: FarmingMaterial[] = [];
    totals.forEach((row, id) => {
        const item = items.get(id);
        if (!item) {
            issues.push({
                characterId: '',
                message: `A required material (${id}) is unavailable in this game's catalog.`,
            });
            return;
        }
        materials.push({
            item,
            required: row.required,
            owned: item.quantity,
            missing: Math.max(0, row.required - item.quantity),
            characters: [...row.characters],
            plans: [...row.plans],
        });
    });
    return { materials, issues };
}
export type FarmingGroup = {
    id: string;
    source: FarmingSource | null;
    materials: FarmingMaterial[];
    characters: string[];
};
export function farmingGroups(
    materials: FarmingMaterial[],
    config?: FarmingConfig,
): FarmingGroup[] {
    const groups = (config?.sources ?? [])
        .map((source) => ({
            id: source.id,
            source,
            materials: materials.filter((row) => source.materialIds.includes(row.item.id)),
            characters: [] as string[],
        }))
        .filter((group) => group.materials.length);
    const known = new Set(groups.flatMap((group) => group.materials.map((row) => row.item.id)));
    const unknown = materials.filter((row) => !known.has(row.item.id));
    const result: FarmingGroup[] = [...groups];
    if (unknown.length)
        {result.push({ id: '@unknown', source: null, materials: unknown, characters: [] });}
    result.forEach(
        (group) =>
            (group.characters = [...new Set(group.materials.flatMap((row) => row.characters))]),
    );
    return result;
}
export function serverDay(now: number, server: FarmingServer): { day: number; date: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: server.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const value = (name: string) => Number(parts.find((part) => part.type === name)?.value);
    const date = new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
    if (value('hour') * 60 + value('minute') < server.resetHour * 60 + server.resetMinute)
        {date.setUTCDate(date.getUTCDate() - 1);}
    return { day: date.getUTCDay(), date: date.toISOString().slice(0, 10) };
}
export function sourceAvailability(
    source: FarmingSource,
    now: number,
    server?: FarmingServer,
): 'available' | 'closed' | 'unknown' {
    if (!source.days?.length) {return 'unknown';}
    if (source.days.length === 7) {return 'available';}
    return server
        ? source.days.includes(serverDay(now, server).day)
            ? 'available'
            : 'closed'
        : 'unknown';
}
