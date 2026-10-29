import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore, Entry } from './workspace.store';
import { DialogFocusDirective } from './dialog-focus';
import { GameImagePicker } from './game-image-picker';
import {
    CharacterCollection,
    CharacterDefinition,
    CharacterRules,
    CharacterSkill,
    CharacterProgression,
    emptyCharacterCollection,
    emptyCharacterDefinition,
    characterCollectionFits,
    characterDefinitionFits,
    validCharacterCollection,
    validCharacterDefinition,
    validCharacterRules,
    guideUrl,
} from '../../../../common/characters';
import { storyImageUrl } from '../../../../common/story-template';

@Component({
    selector: 'gg-characters',
    imports: [FormsModule, DialogFocusDirective, GameImagePicker],
    templateUrl: './characters.html',
    styleUrl: './characters.scss',
})
export class Characters {
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly tab = signal<'collection' | 'catalog'>('collection');
    readonly search = signal('');
    readonly rarity = signal('');
    readonly damageType = signal('');
    readonly catalog = computed(() =>
        this.store
            .entries()
            .filter((e) => e.game === this.game() && e.kind === 'characters')
            .sort((a, b) => a.name.localeCompare(b.name)),
    );
    readonly owned = computed(() => this.catalog().filter((e) => e.characterCollection?.owned));
    readonly rules = computed<CharacterRules | undefined>(
        () => this.store.characterRules()[this.game()],
    );
    readonly busy = computed(
        () => this.store.saving() || this.store.loading() || !this.store.initialized(),
    );
    readonly visible = computed(() =>
        (this.tab() === 'collection' ? this.owned() : this.catalog()).filter(
            (e) =>
                [
                    e.name,
                    e.characterDefinition?.weaponType,
                    e.characterDefinition?.damageType,
                    ...(e.characterDefinition?.roles ?? []),
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(this.search().trim().toLowerCase()) &&
                (!this.rarity() || e.rarity === Number(this.rarity())) &&
                (!this.damageType() || e.characterDefinition?.damageType === this.damageType()),
        ),
    );
    readonly damageTypes = computed(() =>
        [
            ...new Set(
                this.catalog()
                    .map((e) => e.characterDefinition?.damageType)
                    .filter((v): v is string => !!v),
            ),
        ].sort(),
    );
    readonly rarities = computed(() =>
        [...new Set(this.catalog().map((e) => e.rarity))].sort((a, b) => b - a),
    );
    readonly validImage = storyImageUrl;
    readonly selected = computed(() => this.catalog().find((e) => e.id === this.selectedKey()));
    readonly plannerSkills = computed(() => {
        const entry = this.selected();
        if (!entry) return [];
        const data = this.definition(entry);
        return [
            ...data.skills.map((skill, index) => ({ ...skill, key: skill.id ?? `skill-${index}` })),
            ...data.passiveSkills.map((skill, index) => ({
                ...skill,
                key: skill.id ?? `passive-${index}`,
            })),
        ].filter((skill) => (skill.maxLevel ?? 1) > 1);
    });
    readonly validGuide = guideUrl;
    private readonly selectedKey = signal('');
    collection: CharacterCollection | null = null;
    definitionEditor: Entry | null = null;
    rulesEditor: CharacterRules | null = null;
    confirmingRemoval = false;
    showReference = false;
    private savedDraft = '';
    error = '';
    readonly message = signal('');
    constructor() {
        effect(() => {
            this.game();
            this.selectedKey.set('');
            this.collection = null;
            this.definitionEditor = null;
            this.rulesEditor = null;
            this.confirmingRemoval = false;
            this.error = '';
            this.search.set('');
            this.rarity.set('');
            this.damageType.set('');
            this.message.set('');
        });
    }
    details(entry: Entry): void {
        this.selectedKey.set(entry.id);
        this.collection = structuredClone(
            entry.characterCollection ?? {
                ...emptyCharacterCollection(),
                level: Math.max(1, Math.trunc(entry.quantity)),
            },
        );
        this.savedDraft = JSON.stringify(this.collection);
        this.showReference = false;
        this.error = '';
        this.confirmingRemoval = false;
    }
    closeDetails(): void {
        if (!this.busy()) {
            this.selectedKey.set('');
            this.collection = null;
        }
    }
    definition(entry: Entry): CharacterDefinition {
        return entry.characterDefinition ?? emptyCharacterDefinition();
    }
    async saveCollection(): Promise<void> {
        const entry = this.selected(),
            build = this.collection,
            rules = this.rules();
        if (
            !entry ||
            !build ||
            !rules ||
            !validCharacterCollection(build) ||
            !characterCollectionFits(build, rules, entry.characterDefinition)
        ) {
            this.error =
                'Check current and target values against the ascension, skill, and equipment limits. Targets cannot be below current progression. Personal links need a title and an HTTP(S) URL.';
            return;
        }
        const owned = structuredClone(build);
        if (await this.store.saveCharacterCollection(entry.id, owned)) {
            this.collection = owned;
            this.savedDraft = JSON.stringify(owned);
            this.message.set('Your character development plan has been saved.');
            this.error = '';
        } else this.error = this.store.error();
    }
    async removeCollection(): Promise<void> {
        const entry = this.selected();
        if (!entry) return;
        if (
            await this.store.saveCharacterCollection(entry.id, {
                ...emptyCharacterCollection(),
                owned: false,
            })
        ) {
            this.confirmingRemoval = false;
            this.closeDetails();
            this.message.set('Character removed from your collection.');
        } else this.error = this.store.error();
    }
    gearText(id: string, target = false): string {
        return (target ? this.targetProgress() : this.collection)?.gear[id]?.join('\n') ?? '';
    }
    setGear(id: string, value: string, target = false): void {
        if (!this.collection) return;
        const progress = target ? this.ensureTarget() : this.collection;
        const items = this.lines(value);
        if (items.length) progress.gear[id] = items;
        else delete progress.gear[id];
    }
    orphanGear(): string[] {
        return [
            ...new Set([
                ...Object.keys(this.collection?.gear ?? {}),
                ...Object.keys(this.collection?.target?.gear ?? {}),
            ]),
        ].filter((id) => !this.rules()?.equipmentSlots.some((slot) => slot.id === id));
    }
    orphanTracks(): string[] {
        return [
            ...new Set([
                ...Object.keys(this.collection?.progression ?? {}),
                ...Object.keys(this.collection?.target?.progression ?? {}),
            ]),
        ].filter((id) => !this.rules()?.progressionTracks.some((track) => track.id === id));
    }
    clearOrphanGear(id: string): void {
        if (this.collection) delete this.collection.gear[id];
        if (this.collection?.target) delete this.collection.target.gear[id];
    }
    clearOrphanTrack(id: string): void {
        if (this.collection) delete this.collection.progression[id];
        if (this.collection?.target) delete this.collection.target.progression[id];
    }
    editDefinition(entry?: Entry): void {
        if (!this.store.canEdit()) return;
        this.closeDetails();
        this.error = '';
        this.definitionEditor = entry
            ? structuredClone(entry)
            : {
                  id: crypto.randomUUID(),
                  game: this.game(),
                  kind: 'characters',
                  name: '',
                  notes: '',
                  rarity: this.rules()?.rarities[0] ?? 5,
                  category: '',
                  order: this.catalog().length,
                  members: [],
                  requirements: [],
                  day: '',
                  completed: false,
                  quantity: 0,
                  target: 0,
              };
        this.definitionEditor.characterDefinition ??= emptyCharacterDefinition();
        const data = this.definitionEditor.characterDefinition;
        data.skills.forEach((skill, index) => {
            skill.id ??= `skill-${index}`;
        });
        data.passiveSkills.forEach((skill, index) => {
            skill.id ??= `passive-${index}`;
        });
    }
    async saveDefinition(): Promise<void> {
        const entry = this.definitionEditor;
        if (!entry || !this.store.canEdit()) return;
        entry.name = entry.name.trim();
        entry.notes = entry.notes.trim();
        const data = entry.characterDefinition!;
        data.weaponType = data.weaponType.trim();
        data.damageType = data.damageType.trim();
        for (const skill of [...data.skills, ...data.passiveSkills]) {
            skill.name = skill.name.trim();
            skill.description = skill.description.trim();
        }
        for (const guide of data.guides) {
            guide.title = guide.title.trim();
            guide.url = guide.url.trim();
        }
        if (
            !entry.name ||
            !validCharacterDefinition(data) ||
            !Number.isSafeInteger(entry.rarity) ||
            entry.rarity < 1 ||
            entry.rarity > 20 ||
            (entry.icon && !storyImageUrl(entry.icon))
        ) {
            this.error =
                'Enter a name, rarity, valid skill names, maximum skill levels (1–1000), and HTTP(S) guide links.';
            return;
        }
        const rules = this.rules();
        if (rules && !characterDefinitionFits(data, entry.rarity, rules)) {
            this.error =
                "Use the rarity, weapon, damage type, and roles defined in this game's rules.";
            return;
        }
        if (await this.store.save(entry)) {
            this.definitionEditor = null;
            this.message.set('Shared character information saved.');
        } else this.error = this.store.error();
    }
    editRules(): void {
        if (!this.store.canEdit()) return;
        this.error = '';
        this.rulesEditor = structuredClone(
            this.rules() ?? {
                levelCap: 90,
                rarities: [4, 5],
                weaponTypes: [],
                damageTypes: [],
                roles: [],
                enhancementCategories: [],
                equipmentSlots: [],
                progressionTracks: [],
            },
        );
    }
    async saveRules(): Promise<void> {
        const rules = this.rulesEditor;
        if (!rules || !this.store.canEdit()) return;
        for (const row of [...rules.equipmentSlots, ...rules.progressionTracks])
            row.label = row.label.trim();
        if (!validCharacterRules(rules)) {
            this.error =
                'Check the level cap, rarities, ascension rank caps, enhancement categories, and equipment/progression limits. Ascension level caps must increase to the game maximum and skill caps cannot decrease. Keep categories assigned to equipment slots or reassign those slots.';
            return;
        }
        if (
            this.catalog().some(
                (entry) =>
                    entry.characterDefinition &&
                    !characterDefinitionFits(entry.characterDefinition, entry.rarity, rules),
            )
        ) {
            this.error =
                'Keep options used by existing characters, or update those characters before removing the options.';
            return;
        }
        if (await this.store.saveCharacterRules(this.game(), rules)) {
            this.rulesEditor = null;
            this.message.set('Game rules saved for all characters.');
        } else this.error = this.store.error();
    }
    addSlot(): void {
        this.rulesEditor?.equipmentSlots.push({
            id: 'slot-' + crypto.randomUUID(),
            label: '',
            limit: 1,
        });
    }
    addTrack(): void {
        this.rulesEditor?.progressionTracks.push({
            id: 'track-' + crypto.randomUUID(),
            label: '',
            max: 6,
        });
    }
    addAscensionRank(): void {
        if (!this.rulesEditor) return;
        const ranks = (this.rulesEditor.ascensionRanks ??= []);
        ranks.push({
            levelCap: Math.min(this.rulesEditor.levelCap, (ranks.at(-1)?.levelCap ?? 0) + 20),
            skillLevelCap: ranks.at(-1)?.skillLevelCap ?? 1,
        });
    }
    addSkill(skills: CharacterSkill[]): void {
        skills.push({ id: crypto.randomUUID(), name: '', description: '', maxLevel: 1 });
    }
    characterLevelCap(target = false): number {
        return (
            this.rules()?.ascensionRanks?.[
                (target ? this.targetProgress() : this.collection)?.ascensionRank ?? 0
            ]?.levelCap ??
            this.rules()?.levelCap ??
            1000
        );
    }
    skillLevelCap(skill: CharacterSkill, target = false): number {
        const rank =
            this.rules()?.ascensionRanks?.[
                (target ? this.targetProgress() : this.collection)?.ascensionRank ?? 0
            ];
        return Math.min(skill.maxLevel ?? 1, rank?.skillLevelCap ?? 1000);
    }
    setSkillLevel(key: string, level: number, target = false): void {
        if (this.collection)
            ((target ? this.ensureTarget() : this.collection).skillLevels ??= {})[key] = level;
    }
    targetProgress(): CharacterProgression | null {
        return this.collection?.target ?? this.collection;
    }
    private ensureTarget(): CharacterProgression {
        const build = this.collection!;
        return (build.target ??= structuredClone({
            level: build.level,
            ascensionRank: build.ascensionRank ?? 0,
            skillLevels: build.skillLevels ?? {},
            gear: build.gear,
            progression: build.progression,
        }));
    }
    setTargetLevel(level: number): void {
        this.ensureTarget().level = level;
    }
    setTargetRank(rank: number): void {
        this.ensureTarget().ascensionRank = rank;
    }
    setTargetTrack(id: string, value: number): void {
        this.ensureTarget().progression[id] = value;
    }
    levelMinimum(target = false): number {
        const progress = target ? this.targetProgress() : this.collection;
        return Math.max(
            target ? this.collection?.level ?? 1 : 1,
            this.rules()?.ascensionRanks?.[(progress?.ascensionRank ?? 0) - 1]?.levelCap ?? 1,
        );
    }
    hasUnsavedChanges(): boolean {
        return JSON.stringify(this.collection) !== this.savedDraft;
    }
    addPersonalGuide(): void {
        if (this.collection) (this.collection.personalGuides ??= []).push({ title: '', url: '' });
    }
    movePersonalGuide(index: number, offset: number): void {
        const guides = this.collection?.personalGuides;
        if (!guides || index + offset < 0 || index + offset >= guides.length) return;
        [guides[index], guides[index + offset]] = [guides[index + offset], guides[index]];
    }
    orphanSkills(): string[] {
        const entry = this.selected();
        if (!entry) return [];
        const data = this.definition(entry);
        const keys = [
            ...data.skills.map((skill, index) => skill.id ?? `skill-${index}`),
            ...data.passiveSkills.map((skill, index) => skill.id ?? `passive-${index}`),
        ];
        return [
            ...new Set([
                ...Object.keys(this.collection?.skillLevels ?? {}),
                ...Object.keys(this.collection?.target?.skillLevels ?? {}),
            ]),
        ].filter((key) => !keys.includes(key));
    }
    clearOrphanSkill(key: string): void {
        if (this.collection?.skillLevels) delete this.collection.skillLevels[key];
        if (this.collection?.target?.skillLevels) delete this.collection.target.skillLevels[key];
    }
    csv(value: string): string[] {
        return [
            ...new Set(
                value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
            ),
        ];
    }
    rarityValues(value: string): number[] {
        return this.csv(value).map(Number);
    }
    lines(value: string): string[] {
        return value
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean);
    }
}
