import { Component, input, output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CharacterRules } from '@lib/types/character.type';
import type { CharacterAttributeDefinition, CharacterProgressionProfile, ProgressionTrackDefinition } from '@lib/types/character-extension.type';
import type { Entry } from '@lib/types/workspace.type';
import { validCharacterRules } from '@common/characters/characters';
import { characterRulesCompatibility } from '@common/characters/character-rules';
import { DialogFocusDirective } from '../../../../../shared/directives/dialog-focus/dialog-focus';

@Component({
    selector: 'gg-game-rules-editor',
    imports: [FormsModule, DialogFocusDirective],
    templateUrl: './game-rules-editor.html',
    // These are the actual Story Guide editor styles, shared without changing its rendering.
    styleUrls: [
        '../../../story-guide/pages/story-guide/story-editor-dialog.scss',
        '../../../story-guide/components/templates/patch-overview/section-editor.scss',
        '../../../story-guide/components/templates/patch-overview/section-editor-nav.scss',
        './game-rules-editor.scss',
    ],
})
export class GameRulesEditor implements OnInit {
    readonly draft = input.required<CharacterRules>();
    readonly game = input.required<string>();
    readonly gameName = input.required<string>();
    readonly original = input<CharacterRules>();
    readonly entries = input<Entry[]>([]);
    readonly busy = input(false);
    readonly error = input('');
    readonly save = output<void>();
    readonly dismissed = output<void>();
    readonly tabs = ['General', 'Attributes', 'Progression', 'Dependencies', 'Upgrade Costs', 'Display Rules'];
    readonly tabIcons: Record<string, string> = {
        General: 'M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4',
        Attributes: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
        Progression: 'M4 20V10h4v10 M10 20V6h4v14 M16 20V3h4v17',
        Dependencies: 'M12 3v6 M5 13V9h14v4 M3 14h4v6H3z M10 14h4v6h-4z M17 14h4v6h-4z',
        'Upgrade Costs': 'M4 7l8-4 8 4-8 4z M4 12l8 4 8-4 M4 17l8 4 8-4',
        'Display Rules': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    };
    readonly types: CharacterAttributeDefinition['type'][] = ['string', 'number', 'boolean', 'enum', 'multi-select'];
    readonly trackTypes: ProgressionTrackDefinition['type'][] = ['level', 'ascension', 'skill', 'unlock', 'enhancement', 'equipment', 'custom'];
    tab = 'General';
    discard = false;
    validation: string[] = [];
    private initial?: string;
    private dragged: { list: unknown[]; index: number } | null = null;

    snapshot(): void { this.initial ??= JSON.stringify(this.draft()); }
    ngOnInit(): void {
        this.draft().attributes?.sort((a, b) => a.displayOrder - b.displayOrder);
        this.draft().progressionProfiles?.forEach(profile => profile.tracks.sort((a, b) => a.displayOrder - b.displayOrder));
        this.snapshot();
    }
    existingAttribute(id: string): boolean { return !!this.original()?.attributes?.some(attribute => attribute.id === id); }
    existingProfile(id: string): boolean { return !!this.original()?.progressionProfiles?.some(profile => profile.id === id); }
    existingTrack(profile: string, id: string): boolean { return !!this.original()?.progressionProfiles?.find(value => value.id === profile)?.tracks.some(track => track.id === id); }
    close(): void {
        if (this.busy()) {return;}
        if (JSON.stringify(this.draft()) !== (this.initial ?? JSON.stringify(this.original() ?? this.draft()))) {this.discard = true;}
        else {this.dismissed.emit();}
    }
    select(tab: string): void { this.snapshot(); this.tab = tab; }
    csv(value: string): string[] { return value.split(',').map(value => value.trim()).filter(Boolean); }
    numbers(value: string): number[] { return this.csv(value).map(Number); }
    addAttribute(): void {
        const list = this.draft().attributes ??= [];
        list.push({ id: `attribute-${crypto.randomUUID()}`, label: '', type: 'string', displayOrder: list.length, filterable: false, visibleInHeader: false });
    }
    addProfile(): void { (this.draft().progressionProfiles ??= []).push({ id: `profile-${crypto.randomUUID()}`, gameId: this.game(), tracks: [] }); }
    cleanAbility(track: ProgressionTrackDefinition): void { if (!track.abilityId?.trim()) {delete track.abilityId;} }
    addDependency(track: ProgressionTrackDefinition): void { (track.dependencies ??= []).push({ trackId: '', requiredValue: 0 }); }
    addCost(track: ProgressionTrackDefinition): void { (track.upgradeCosts ??= []).push({ fromValue: 0, toValue: 1, materials: [{itemId: '', quantity: 1}] }); }
    addSlot(): void { this.draft().equipmentSlots.push({id: `slot-${crypto.randomUUID()}`, label: '', limit: 1}); }
    addLegacyTrack(): void { this.draft().progressionTracks.push({id: `track-${crypto.randomUUID()}`, label: '', max: 1}); }
    addRank(): void { (this.draft().ascensionRanks ??= []).push({levelCap: this.draft().levelCap, skillLevelCap: 1}); }
    addTrack(profile: CharacterProgressionProfile): void {
        profile.tracks.push({ id: `track-${crypto.randomUUID()}`, label: '', type: 'custom', minValue: 0, maxValue: 1, displayOrder: profile.tracks.length });
    }
    setType(track: ProgressionTrackDefinition, type: ProgressionTrackDefinition['type']): void {
        track.type = type;
        if (type === 'unlock') {delete track.minValue; delete track.maxValue; delete track.levels; delete track.storage;}
        else {track.minValue ??= 0; track.maxValue ??= 1;}
    }
    setLevels(track: ProgressionTrackDefinition, value: string): void { if (value.trim()) {track.levels = this.numbers(value);} else {delete track.levels;} }
    setDefault(value: string): void { if (value) {this.draft().defaultProgressionProfileId = value;} else {delete this.draft().defaultProgressionProfileId;} }
    setVersion(value: string): void {
        const version = value.trim();
        if (version) {this.draft().configurationVersion = version;} else {delete this.draft().configurationVersion;}
    }
    move<T extends { displayOrder: number }>(list: T[], index: number, offset: number): void {
        const target = index + offset;
        if (this.busy() || target < 0 || target >= list.length) {return;}
        list.splice(target, 0, list.splice(index, 1)[0]!);
        list.forEach((item, order) => { item.displayOrder = order; });
    }
    drag(event: DragEvent, list: unknown[], index: number): void { this.dragged = { list, index }; event.dataTransfer?.setData('text/plain', String(index)); }
    drop<T extends { displayOrder: number }>(event: DragEvent, list: T[], index: number): void {
        event.preventDefault();
        if (this.dragged?.list === list) {this.move(list, this.dragged.index, index - this.dragged.index);}
        this.dragged = null;
    }
    materials(): Entry[] { return this.entries().filter(entry => entry.game === this.game() && entry.kind === 'inventory'); }
    submit(): void {
        if (this.busy()) {return;}
        const rules = this.draft();
        this.validation = [];
        if (!validCharacterRules(rules)) {this.validation.push('Check identifiers, required labels, unique options, numeric bounds, default profile, dependencies and upgrade transitions.');}
        if (rules.progressionProfiles?.some(profile => profile.gameId !== this.game() || profile.tracks.some(track => track.upgradeCosts?.some(cost => cost.materials.some(material => !this.materials().some(entry => entry.id === material.itemId)))))) {this.validation.push('Upgrade materials must reference inventory items in this game.');}
        this.validation.push(...characterRulesCompatibility(this.original(), rules));
        if (!this.validation.length) {this.save.emit();}
    }
}
