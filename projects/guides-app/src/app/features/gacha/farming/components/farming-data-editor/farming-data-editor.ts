import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore } from "../../../../../core/state/workspace.store";
import { DialogFocusDirective } from "../../../../../shared/directives/dialog-focus/dialog-focus";
import type { FarmingConfig, FarmingSource, UpgradeRecipe } from "../../../../../../../../lib/types/farming-config.type";
import { validFarmingConfig, validRecipes } from "../../../../../../../../common/farming/farming-config";

@Component({
    selector: 'gg-farming-data-editor',
    imports: [FormsModule, DialogFocusDirective],
    templateUrl: "./farming-data-editor.html",
    styleUrl: "./farming-data-editor.scss",
})
export class FarmingDataEditor {
    readonly game = input.required<string>();
    readonly closed = output<void>();
    readonly store = inject(WorkspaceStore);
    readonly tabs = ['sources', 'recipes', 'servers'] as const;
    readonly tab = signal<'sources' | 'recipes' | 'servers'>('sources');
    readonly weekdays = [
        { id: 1, label: 'Mon' },
        { id: 2, label: 'Tue' },
        { id: 3, label: 'Wed' },
        { id: 4, label: 'Thu' },
        { id: 5, label: 'Fri' },
        { id: 6, label: 'Sat' },
        { id: 0, label: 'Sun' },
    ];
    data: FarmingConfig = { sources: [], servers: [] };
    recipes: Record<string, UpgradeRecipe[]> = {};
    characterId = '';
    error = '';
    constructor() {
        effect(() => {
            this.data = structuredClone(
                this.store.characterRules()[this.game()]?.farming ?? { sources: [], servers: [] },
            );
            this.recipes = Object.fromEntries(
                this.characters().map((entry) => [
                    entry.id,
                    structuredClone(entry.characterDefinition?.recipes ?? []),
                ]),
            );
            this.characterId = this.characters()[0]?.id ?? '';
        });
    }
    items() {
        return this.store
            .entries()
            .filter((entry) => entry.game === this.game() && entry.kind === 'inventory')
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    characters() {
        return this.store
            .entries()
            .filter(
                (entry) =>
                    entry.game === this.game() &&
                    entry.kind === 'characters' &&
                    entry.characterDefinition,
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    skills() {
        const definition = this.characters().find((entry) => entry.id === this.characterId)
            ?.characterDefinition;
        return [
            ...(definition?.skills ?? []).map((skill, index) => ({
                id: skill.id ?? `skill-${index}`,
                name: skill.name,
            })),
            ...(definition?.passiveSkills ?? []).map((skill, index) => ({
                id: skill.id ?? `passive-${index}`,
                name: skill.name,
            })),
        ];
    }
    tracks() {
        return this.store.characterRules()[this.game()]?.progressionTracks ?? [];
    }
    addSource(): void {
        this.data.sources.push({
            id: crypto.randomUUID(),
            name: '',
            category: '',
            region: '',
            location: '',
            materialIds: [],
            url: '',
            restrictions: '',
        });
    }
    toggleMaterial(source: FarmingSource, id: string): void {
        source.materialIds = source.materialIds.includes(id)
            ? source.materialIds.filter((item) => item !== id)
            : [...source.materialIds, id];
    }
    toggleDay(source: FarmingSource, day: number): void {
        const days = source.days ?? [];
        const next = days.includes(day) ? days.filter((item) => item !== day) : [...days, day];
        if (next.length) {source.days = next;}
        else {delete source.days;}
    }
    addServer(): void {
        this.data.servers.push({
            id: crypto.randomUUID(),
            name: '',
            timeZone: '',
            resetHour: 0,
            resetMinute: 0,
        });
    }
    addRecipe(): void {
        if (this.characterId)
            {(this.recipes[this.characterId] ??= []).push({
                kind: 'level',
                from: 1,
                to: 2,
                materials: [],
            });}
    }
    changeKind(recipe: UpgradeRecipe): void {
        if (recipe.kind === 'skill') {recipe.key = this.skills()[0]?.id ?? '';}
        else if (recipe.kind === 'progression') {recipe.key = this.tracks()[0]?.id ?? '';}
        else {delete recipe.key;}
        this.changeFrom(recipe, recipe.kind === 'level' || recipe.kind === 'skill' ? 1 : 0);
    }
    changeFrom(recipe: UpgradeRecipe, from: number): void {
        recipe.from = from;
        recipe.to = from + 1;
    }
    addCost(recipe: UpgradeRecipe): void {
        recipe.materials.push({ item: this.items()[0]?.id ?? '', amount: 1 });
    }
    close(): void {
        if (!this.store.saving()) {this.closed.emit();}
    }
    async save(): Promise<void> {
        if (!this.store.canEdit() || this.store.saving()) {return;}
        const rules = this.store.characterRules()[this.game()];
        if (!rules) {
            this.error = 'Configure game progression rules in Characters first.';
            return;
        }
        const ids = new Set(this.items().map((item) => item.id));
        if (
            !validFarmingConfig(this.data) ||
            this.data.sources.some((source) => source.materialIds.some((id) => !ids.has(id))) ||
            Object.values(this.recipes).some(
                (recipes) =>
                    !validRecipes(recipes) ||
                    recipes.some((recipe) => recipe.materials.some((cost) => !ids.has(cost.item))),
            )
        ) {
            this.error =
                'Check source names/categories, material selections, recipe transitions and whole quantities, URLs, time zones, and reset times. Duplicate upgrade transitions are not allowed.';
            return;
        }
        const entries = this.store
            .entries()
            .map((entry) =>
                entry.game === this.game() &&
                entry.characterDefinition &&
                Object.hasOwn(this.recipes, entry.id) &&
                JSON.stringify(entry.characterDefinition.recipes ?? []) !==
                    JSON.stringify(this.recipes[entry.id])
                    ? {
                          ...entry,
                          characterDefinition: {
                              ...entry.characterDefinition,
                              recipes: structuredClone(this.recipes[entry.id]),
                          },
                      }
                    : entry,
            );
        if (
            await this.store.replace(entries, {
                [this.game()]: { ...rules, farming: structuredClone(this.data) },
            })
        )
            {this.closed.emit();}
        else {this.error = this.store.error();}
    }
}
