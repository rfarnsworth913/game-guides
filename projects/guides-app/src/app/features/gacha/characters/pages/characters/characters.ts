import { Component, computed, effect, ElementRef, inject, input, signal, untracked } from '@angular/core';
import { characterCosts } from "@common/farming/farming";
import { FormsModule } from '@angular/forms';
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import { DialogFocusDirective } from "../../../../../shared/directives/dialog-focus/dialog-focus";
import { GameImagePicker } from "../../../../../shared/components/image-selector/game-image-picker";
import type { CharacterCollection, CharacterDefinition, CharacterRules, CharacterSkill, CharacterProgression } from "@lib/types/character.type";
import { emptyCharacterCollection, emptyCharacterDefinition, characterCollectionFits, characterDefinitionFits, validCharacterCollection, validCharacterDefinition, validCharacterRules, guideUrl } from "@common/characters/characters";
import { storyImageUrl, emptyPatchOverview } from "@common/quests/story-template";
import { GameRulesEditor } from '../../components/game-rules-editor/game-rules-editor';
import { CharacterCatalogFields } from '../../components/character-details/character-catalog-fields';
import { CharacterDetails } from '../../components/character-details/character-details';
import { CharacterCard } from '../../components/character-card/character-card';
import { characterCard } from '../../utils/character-inventory';
import { characterRulesCompatibility } from '@common/characters/character-rules';

@Component({
    selector: 'gg-characters',
    imports: [FormsModule, DialogFocusDirective, GameImagePicker, CharacterCard, GameRulesEditor, CharacterDetails, CharacterCatalogFields],
    templateUrl: "./characters.html",
    styleUrls: ["./characters.scss", './character-controls.scss', './character-inventory.scss', './character-editor.scss', './character-editor-images.scss'],
    host: { '(document:click)': 'dismissMenus($event)' },
})
export class Characters {
    readonly game = input.required<string>();
    readonly focusId = input('');
    private lastFocus = '';
    readonly store = inject(WorkspaceStore);
    readonly tab = signal<'collection' | 'catalog'>('collection');
    readonly search = signal('');
    readonly rarity = signal('');
    readonly damageType = signal('');
    readonly filtersOpen = signal(false);
    readonly ownershipFilter = signal('all');
    readonly favoritesOnly = signal(false);
    readonly progressionFilter = signal('all');
    readonly attributeFilters = signal<Record<string, string>>({});
    readonly sort = signal('name-asc');
    readonly viewMode = signal<'grid' | 'list'>('grid');
    readonly page = signal(1);
    readonly pageSize = signal(this.savedPageSize());
    private readonly pending = signal(false);
    private readonly optimisticOwnership = signal<Record<string, boolean>>({});
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly gameName = computed(() => this.store.games?.().find(game => game.id === this.game())?.name ?? this.game());
    readonly accent = computed(() => this.store.games?.().find(game => game.id === this.game())?.color ?? 'var(--color-primary)');
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
        () => this.pending() || this.store.saving() || this.store.loading() || !this.store.initialized(),
    );
    readonly cards = computed(() => this.catalog().map(entry => {
        const owned = this.optimisticOwnership()[entry.id];
        const card = characterCard(entry, this.rules(),this.store.entries());
        return owned === globalThis.undefined ? card : { ...card, owned, planned: !owned && !!entry.characterCollection?.target };
    }));
    readonly collectionCards = computed(() => this.cards().filter(card => card.owned || card.planned));
    readonly ownedCount = computed(() => this.cards().filter(card => card.owned).length);
    readonly maxLevelCount = computed(() => this.cards().filter(card => card.owned && card.maximumLevel !== globalThis.undefined && (card.currentLevel ?? 0) >= card.maximumLevel).length);
    readonly filterDefinitions = computed(() => {
        const configured = this.rules()?.attributes?.filter(attribute => attribute.filterable).slice().sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
        const definitions = this.rules()?.attributes?.length ? configured ?? [] : [{ id: 'damageType', label: 'Damage type' }, { id: 'weaponType', label: 'Weapon' }, { id: 'roles', label: 'Role' }];
        return definitions.map(attribute => ({ ...attribute, values: [...new Set(this.cards().flatMap(card => card.attributeValues[attribute.id] ?? []))].sort((a, b) => a.localeCompare(b)) })).filter(attribute => attribute.values.length);
    });
    readonly activeFilterCount = computed(() => Number(!!this.rarity()) + Number(!!this.damageType()) + Number(this.ownershipFilter() !== 'all') + Number(this.favoritesOnly()) + Number(this.progressionFilter() !== 'all') + Object.values(this.attributeFilters()).filter(Boolean).length);
    readonly filteredCards = computed(() => {
        const cards = (this.tab() === 'collection' ? this.collectionCards() : this.cards()).filter(card =>
            card.searchText.includes(this.search().trim().toLocaleLowerCase()) && (!this.rarity() || card.rarity === Number(this.rarity())) &&
            (!this.damageType() || card.attributeValues['damageType']?.includes(this.damageType())) &&
            (this.ownershipFilter() === 'all' || (this.ownershipFilter() === 'owned' ? card.owned : !card.owned)) && (!this.favoritesOnly() || card.favorite) &&
            (this.progressionFilter() === 'all' || (this.progressionFilter() === 'planned' ? card.planned : this.progressionFilter() === 'unfinished' ? card.unfinished : card.hasGoal && !card.unfinished)) &&
            Object.entries(this.attributeFilters()).every(([id, value]) => !value || card.attributeValues[id]?.includes(value)));
        return cards.slice().sort((a, b) => {
            const order = this.sort() === 'name-desc' ? b.name.localeCompare(a.name) : this.sort() === 'rarity-desc' ? b.rarity - a.rarity : this.sort() === 'rarity-asc' ? a.rarity - b.rarity : this.sort() === 'level-desc' ? (b.currentLevel ?? -1) - (a.currentLevel ?? -1) : this.sort() === 'favorites' ? Number(b.favorite) - Number(a.favorite) : 0;
            return order || a.name.localeCompare(b.name) || a.characterId.localeCompare(b.characterId);
        });
    });
    readonly visible = computed(() => this.filteredCards().map(card => card.entry));
    readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredCards().length / (this.pageSize() || Math.max(1, this.filteredCards().length)))));
    readonly currentPage = computed(() => Math.min(Math.max(1, this.page()), this.pageCount()));
    readonly resultStart = computed(() => this.filteredCards().length ? (this.currentPage() - 1) * (this.pageSize() || this.filteredCards().length) + 1 : 0);
    readonly pageCards = computed(() => this.pageSize() ? this.filteredCards().slice(this.resultStart() - 1, this.resultStart() - 1 + this.pageSize()) : this.filteredCards());
    readonly resultEnd = computed(() => this.resultStart() ? this.resultStart() + this.pageCards().length - 1 : 0);
    readonly pageNumbers = computed(() => Array.from({ length: Math.min(5, this.pageCount()) }, (_, index) => Math.max(1, Math.min(this.currentPage() - 2, this.pageCount() - 4)) + index));
    readonly damageTypes = computed(() =>
        [
            ...new Set(
                this.catalog()
                    .map((e) => this.definition(e).damageType)
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
        if (!entry) {return [];}
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
    readonly editorSections = [
        { id: 'overview', label: 'Overview', description: 'Basic information shared across the character catalog, planner and story guides.', icon: 'M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4' },
        { id: 'attributes', label: 'Attributes & Progression', description: 'Choose the progression profile and game-specific character attributes.', icon: 'M4 7h16M4 17h16M8 4v6M16 14v6' },
        { id: 'images', label: 'Images', description: 'Manage the character’s artwork used across the site.', icon: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01' },
        { id: 'skills', label: 'Skills', description: 'Define active skills, descriptions and maximum skill levels.', icon: 'M14 3h7v7M21 3 3 21M4 13l7 7' },
        { id: 'passives', label: 'Passive Skills', description: 'Define passive abilities and their maximum levels.', icon: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z' },
        { id: 'resources', label: 'Resources & Guides', description: 'Organize shared resources, related story content and strategy links.', icon: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15' },
    ] as const;
    readonly editorSection = signal<(typeof this.editorSections)[number]>(this.editorSections[0]);
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
            this.clearFilters(); this.sort.set('name-asc'); this.viewMode.set('grid'); this.page.set(1); this.filtersOpen.set(false);
            this.message.set('');
        });
        effect(() => {
            const key = `${this.game()}/${this.focusId()}`;
            const entry = this.focusId() ? this.catalog().find(entry => entry.id === this.focusId()) : null;
            if (entry && this.store.initialized() && this.lastFocus !== key) {
                this.lastFocus = key;
                untracked(() => this.details(entry));
            }
            if (!this.focusId()) {this.lastFocus = '';}
        });
        effect(() => {
            this.tab(); this.search(); this.rarity(); this.damageType(); this.ownershipFilter(); this.favoritesOnly(); this.progressionFilter(); this.attributeFilters(); this.sort(); this.pageSize();
            untracked(() => this.page.set(1));
        });
        effect(() => {try {localStorage.setItem('gg-characters-page-size-v1', String(this.pageSize()));} catch { /* Browsing remains available without storage. */ }});
    }
    private savedPageSize(): number {
        try {const raw = localStorage.getItem('gg-characters-page-size-v1'); const value = raw === null ? 24 : Number(raw); return [0, 12, 24, 48].includes(value) ? value : 24;} catch {return 24;}
    }
    clearFilters(): void {this.rarity.set(''); this.damageType.set(''); this.ownershipFilter.set('all'); this.favoritesOnly.set(false); this.progressionFilter.set('all'); this.attributeFilters.set({});}
    setAttributeFilter(id: string, value: string): void {this.attributeFilters.update(filters => ({ ...filters, [id]: value }));}
    dismissMenus(event: MouseEvent): void {
        for (const menu of this.hostElement.nativeElement.querySelectorAll<HTMLDetailsElement>('.character-manage[open]')) {if (!event.composedPath().includes(menu)) {menu.open = false;}}
    }
    async toggleOwnership(entry: Entry): Promise<void> {
        if (this.busy()) {return;}
        const collection = structuredClone(entry.characterCollection ?? { ...emptyCharacterCollection(), owned: false });
        collection.owned = !collection.owned;
        this.pending.set(true); this.error = ''; this.message.set(''); this.optimisticOwnership.update(values => ({ ...values, [entry.id]: collection.owned }));
        try {
            if (await this.store.saveCharacterCollection(entry.id, collection)) {this.message.set(`${entry.name} ${collection.owned ? 'added to' : 'removed from'} your collection. Saved progression is retained.`);}
            else {this.error = this.store.error() || 'Could not save ownership. Please retry.';}
        } catch (error) {this.error = error instanceof Error ? error.message : 'Could not save ownership.';}
        finally {this.optimisticOwnership.update(values => {const next = { ...values }; Reflect.deleteProperty(next, entry.id); return next;}); this.pending.set(false);}
    }
    async toggleFavorite(entry: Entry): Promise<void> {
        if (this.busy()) {return;}
        const collection = structuredClone(entry.characterCollection ?? { ...emptyCharacterCollection(), owned: false });
        collection.favorite = !collection.favorite; this.pending.set(true); this.error = ''; this.message.set('');
        try {if (!await this.store.saveCharacterCollection(entry.id, collection)) {this.error = this.store.error() || 'Could not save favorite.';} else {this.message.set(`${entry.name} ${collection.favorite ? 'added to' : 'removed from'} favorites.`);}}
        catch (error) {this.error = error instanceof Error ? error.message : 'Could not save favorite.';}
        finally {this.pending.set(false);}
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
        return entry.characterDefinition ?? { ...emptyCharacterDefinition(), damageType: entry.characterInformation?.damageType ?? '' };
    }
    materialPlan(entry: Entry) {
        const result = characterCosts(entry.characterDefinition, this.collection ?? emptyCharacterCollection());
        const materials = this.store.entries().filter(item => item.game === this.game() && item.kind === 'inventory' && result.costs.has(item.id)).map(item => ({ item, owned: item.quantity, required: result.costs.get(item.id)!, missing: Math.max(0, result.costs.get(item.id)! - item.quantity), characters: [entry.id], plans: [] }));
        return { materials, issues: result.issues };
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
            !characterCollectionFits(build, rules, entry.characterDefinition, entry.characterCollection)
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
        } else {this.error = this.store.error();}
    }
    async removeCollection(): Promise<void> {
        const entry = this.selected();
        if (!entry) {return;}
        if (
            await this.store.saveCharacterCollection(entry.id, {
                ...emptyCharacterCollection(),
                owned: false,
            })
        ) {
            this.confirmingRemoval = false;
            this.closeDetails();
            this.message.set('Character removed from your collection.');
        } else {this.error = this.store.error();}
    }
    gearText(id: string, target = false): string {
        return (target ? this.targetProgress() : this.collection)?.gear[id]?.join('\n') ?? '';
    }
    setGear(id: string, value: string, target = false): void {
        if (!this.collection) {return;}
        const progress = target ? this.ensureTarget() : this.collection;
        const items = this.lines(value);
        if (items.length) {progress.gear[id] = items;}
        else {Reflect.deleteProperty(progress.gear, id);}
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
        if (this.collection) {Reflect.deleteProperty(this.collection.gear, id);}
        if (this.collection?.target) {Reflect.deleteProperty(this.collection.target.gear, id);}
    }
    clearOrphanTrack(id: string): void {
        if (this.collection) {Reflect.deleteProperty(this.collection.progression, id);}
        if (this.collection?.target) {Reflect.deleteProperty(this.collection.target.progression, id);}
    }
    editDefinition(entry?: Entry): void {
        if (!this.store.canEdit()) {return;}
        this.closeDetails();
        this.error = '';
        this.editorSection.set(this.editorSections[0]);
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
        this.definitionEditor.characterDefinition ??= this.definition(this.definitionEditor);
        const data = this.definitionEditor.characterDefinition;
        data.skills.forEach((skill, index) => {
            skill.id ??= `skill-${index}`;
        });
        data.passiveSkills.forEach((skill, index) => {
            skill.id ??= `passive-${index}`;
        });
    }
    selectEditorSection(section: (typeof this.editorSections)[number]): void {
        this.editorSection.set(section);
        const panel = this.hostElement.nativeElement.querySelector<HTMLElement>('.character-editor-main');
        if (panel) {panel.scrollTop = 0;}
    }
    characterTypeOptions(type: 'weaponTypes' | 'damageTypes', current: string): string[] {
        return [...new Set([...(this.rules()?.[type] ?? []), ...(current ? [current] : [])])]
            .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    }
    setHeadshot(value: string): void {
        const definition = this.definitionEditor?.characterDefinition;
        if (!definition) {return;}
        if (value) {definition.headshot = value;} else {Reflect.deleteProperty(definition, 'headshot');}
        if (this.definitionEditor) {
            if (value) {this.definitionEditor.icon = value;} else {Reflect.deleteProperty(this.definitionEditor, 'icon');}
        }
    }
    setSplashArt(value: string): void {
        if (!this.definitionEditor) {return;}
        const information = this.definitionEditor.characterInformation ??= emptyPatchOverview();
        information.imageUrl = value;
    }
    setCharacterBanner(value: string): void {
        const definition = this.definitionEditor?.characterDefinition;
        if (!definition) {return;}
        if (value) {definition.banner = value;} else {Reflect.deleteProperty(definition, 'banner');}
    }
    async saveDefinition(): Promise<void> {
        const entry = this.definitionEditor;
        if (!entry || !this.store.canEdit()) {return;}
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
        } else {this.error = this.store.error();}
    }
    detailAttributes(entry: Entry): {id: string; label: string; value: string}[] {
        const definition = this.definition(entry);
        const values: Record<string, string | number | boolean | string[]> = {weaponType: definition.weaponType, damageType: definition.damageType, roles: definition.roles, ...definition.attributes};
        return (this.rules()?.attributes ?? []).filter(attribute => attribute.visibleInDetails !== false).slice().sort((a, b) => a.displayOrder - b.displayOrder).flatMap(attribute => {
            const value = values[attribute.id];
            return value === globalThis.undefined || value === '' || (Array.isArray(value) && !value.length) ? [] : [{id: attribute.id, label: attribute.label, value: Array.isArray(value) ? value.join(', ') : String(value)}];
        });
    }
    editRules(): void {
        if (!this.store.canEdit()) {return;}
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
        if (!rules || !this.store.canEdit()) {return;}
        const compatibility = characterRulesCompatibility(this.rules(), rules);
        if (compatibility.length) {this.error = compatibility.join(' '); return;}
        for (const row of [...rules.equipmentSlots, ...rules.progressionTracks])
            {row.label = row.label.trim();}
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
        } else {this.error = this.store.error();}
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
            {((target ? this.ensureTarget() : this.collection).skillLevels ??= {})[key] = level;}
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
        if (this.collection) {(this.collection.personalGuides ??= []).push({ title: '', url: '' });}
    }
    movePersonalGuide(index: number, offset: number): void {
        const guides = this.collection?.personalGuides;
        if (!guides || index + offset < 0 || index + offset >= guides.length) {return;}
        [guides[index], guides[index + offset]] = [guides[index + offset], guides[index]];
    }
    orphanSkills(): string[] {
        const entry = this.selected();
        if (!entry) {return [];}
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
        if (this.collection?.skillLevels) {Reflect.deleteProperty(this.collection.skillLevels, key);}
        if (this.collection?.target?.skillLevels) {Reflect.deleteProperty(this.collection.target.skillLevels, key);}
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
