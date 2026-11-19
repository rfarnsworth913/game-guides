import {Component, computed, input} from '@angular/core';
import {RouterLink} from '@angular/router';
import type {Entry} from '@lib/types/workspace.type';
import type {CharacterGuide} from '@lib/types/character.type';
import {characterCatalogRecord} from '@common/characters/character-catalog';
import {guideUrl} from '@common/characters/characters';

@Component({
    selector:'gg-character-resources', imports:[RouterLink], templateUrl:'./character-resources.html', styles:[`
        h3{font-size:15px;margin:0 0 12px}.resource-group{border:1px solid var(--color-border);border-radius:9px;margin:10px 0;background:var(--color-bg-secondary)}summary{display:flex;align-items:center;gap:10px;padding:13px;cursor:pointer;font-size:13px;list-style:none}summary::-webkit-details-marker{display:none}summary::after{content:'';width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform 180ms;margin-left:5px}details[open]>summary::after{transform:rotate(45deg)}summary small{margin-left:auto;color:var(--color-text-secondary)}svg{flex-shrink:0}.character-guide-links{padding:0 14px 12px;margin:0;list-style:none}li{padding:10px 0;border-top:1px solid var(--color-border);font-size:13px;overflow-wrap:anywhere}li small{display:block;font-size:11px;color:var(--color-text-secondary);margin-top:4px}li p{font-size:12px;line-height:1.5;margin:6px 0 0}.resource-empty{font-size:12px;color:var(--color-text-secondary)}@media(prefers-reduced-motion:reduce){summary::after{transition:none}}
    `],
})
export class CharacterResources {
    readonly entry = input.required<Entry>();
    readonly entries = input<Entry[]>([]);
    readonly personal = input<CharacterGuide[]>([]);
    readonly validUrl = (url?:string) => !!url && guideUrl(url);
    readonly groups = computed(() => {
        const entry = this.entry();
        const resources = characterCatalogRecord(entry,this.entries()).resources.map(resource => {
            const linked = this.entries().find(item => item.game === entry.game && item.kind === 'story' && item.id === resource.contentId);
            return {...resource, internal:linked ? {path:`/games/${entry.game}/story`,section:linked.storySection,id:linked.id} : null};
        }).filter(resource => resource.internal || this.validUrl(resource.url));
        const labels:Record<string,string> = {'official-lore':'Official Lore','build-guides':'Build Guides',videos:'Videos',fanworks:'Fanworks','related-content':'Related Content'};
        const keys = [...new Set([...Object.keys(labels),...resources.map(resource => resource.category)])];
        return keys.map(id => ({id,label:labels[id] ?? id.replaceAll('-',' '),resources:resources.filter(resource => resource.category === id)})).filter(group => group.resources.length);
    });
    hostname(url:string):string {try{return new URL(url).hostname;}catch{return '';}}
}
