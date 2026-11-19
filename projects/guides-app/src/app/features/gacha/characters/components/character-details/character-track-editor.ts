import {Component, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import type {CharacterProgression} from '@lib/types/character.type';
import type {ProgressionTrackDefinition} from '@lib/types/character-extension.type';
import {characterTrackValue} from '@common/characters/character-progression';
import {trackMinimum,trackMaximum} from '@common/characters/character-extension';

@Component({
    selector:'gg-character-track-editor', imports:[FormsModule], templateUrl:'./character-track-editor.html', styles:[`
        :host{display:block}.track-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.track-pair label{display:grid;gap:8px;margin:0;font-size:12px;min-width:0}.track-pair input,.track-pair select{width:100%;box-sizing:border-box;min-height:42px;margin:0}.track-help{font-size:12px;color:var(--color-text-secondary);line-height:1.5;margin:12px 0 0}@media(max-width:450px){.track-pair{gap:10px}}
    `],
})
export class CharacterTrackEditor {
    readonly track = input.required<ProgressionTrackDefinition>();
    readonly tracks = input<ProgressionTrackDefinition[]>([]);
    readonly current = input.required<CharacterProgression>();
    readonly target = input.required<CharacterProgression>();
    readonly owned = input(true);
    readonly disabled = input(false);
    readonly currentCap = input<number>();
    readonly targetCap = input<number>();
    readonly valueChanged = output<{target:boolean;value:number}>();
    readonly minimum = () => trackMinimum(this.track());
    readonly maximum = () => trackMaximum(this.track());
    value(target:boolean):number {return characterTrackValue(target ? this.target() : this.current(),this.track());}
    label(id:string):string {return this.tracks().find(track => track.id === id)?.label ?? id;}
}
