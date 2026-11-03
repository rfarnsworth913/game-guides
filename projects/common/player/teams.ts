import type { Team } from '../../lib/types/team.type';

export const teamSize = (rules?: { teamSize?: number }): number => rules?.teamSize ?? 4;
export function validTeams(value: unknown): value is Team[] {
    return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((team: unknown) => {
            if (!team || typeof team !== 'object' || Array.isArray(team)) {return false;}
            const item = team as Record<string, unknown>;
            return (
                Object.keys(item).every((key) =>
                    ['id', 'name', 'members', 'notes'].includes(key),
                ) &&
                typeof item['id'] === 'string' &&
                /^[a-zA-Z0-9_-]{1,100}$/.test(item['id']) &&
                !['__proto__', 'constructor', 'prototype'].includes(item['id']) &&
                typeof item['name'] === 'string' &&
                !!item['name'].trim() &&
                item['name'].length <= 160 &&
                typeof item['notes'] === 'string' &&
                item['notes'].length <= 5000 &&
                Array.isArray(item['members']) &&
                item['members'].length >= 1 &&
                item['members'].length <= 12 &&
                item['members'].every(
                    (id) =>
                        typeof id === 'string' &&
                        id.length > 0 &&
                        id.length <= 300 &&
                        !/[.$]/.test(id) && !Array.from(id).some(character => character.charCodeAt(0) < 32) &&
                        !['__proto__', 'constructor', 'prototype'].includes(id),
                ) &&
                new Set(item['members']).size === item['members'].length
            );
        }) &&
        new Set(value.map((team: Team) => team.id)).size === value.length
    );
}
