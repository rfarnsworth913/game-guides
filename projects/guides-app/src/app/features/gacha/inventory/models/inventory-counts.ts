import type {Entry} from '@lib/types/workspace.type';

/** Imports set counts for known items in the current game; omitted items are untouched. */
export function parseInventoryCounts(text: string, entries: Entry[], game: string): Record<string,number> {
    const source=text.replace(/^\uFEFF/,'').trim();
    if(!source || source.length>1000000){throw new Error('Enter counts or choose a JSON/CSV file up to 1 MB.');}
    let rows:unknown;
    if(source.startsWith('{') || source.startsWith('[')) {
        try {const parsed:unknown=JSON.parse(source); rows=Array.isArray(parsed) ? parsed : parsed && typeof parsed==='object' ? Object.entries(parsed as Record<string,unknown>).map(([itemId,quantity])=>({itemId,quantity})) : null;}
        catch {throw new Error('Invalid JSON. Use an item ID to quantity object or an array of itemId and quantity records.');}
    } else {
        const lines=source.split(/\r?\n/).filter(line=>line.trim());
        if(/^itemId\s*,\s*quantity$/i.test(lines[0].trim())){lines.shift();}
        rows=lines.map(line=>{const values=line.split(',').map(value=>value.trim()); if(values.length!==2 || !/^\d+$/.test(values[1])){throw new Error('CSV rows must contain itemId,quantity with whole, nonnegative counts.');}return {itemId:values[0],quantity:Number(values[1])};});
    }
    if(!Array.isArray(rows) || !rows.length || rows.length>10000){throw new Error('Provide between 1 and 10,000 item counts.');}
    const catalog=new Map(entries.filter(item=>item.game===game && item.kind==='inventory').map(item=>[item.id,item]));
    const changes:Record<string,number>={};
    for(const row of rows as unknown[]) {
        if(!row || typeof row!=='object' || Array.isArray(row) || !('itemId' in row) || typeof row.itemId!=='string' || !('quantity' in row) || Object.keys(row).some(key=>!['itemId','quantity'].includes(key))){throw new Error('Each count must have only itemId and quantity fields.');}
        const item=catalog.get(row.itemId);
        if(!item){throw new Error(`Unknown inventory item in this game: ${row.itemId}. Use its stable item ID.`);}
        if(Object.hasOwn(changes,row.itemId)){throw new Error(`Duplicate count for ${item.name}.`);}
        const quantity=row.quantity;
        if(typeof quantity!=='number' || !Number.isSafeInteger(quantity) || quantity<0 || quantity>(item.maxStack ?? 1e9) || quantity<(item.equipmentInstances?.length ?? 0)){throw new Error(`Invalid quantity for ${item.name}. Use a whole count within its stack limit and at least the number of owned equipment copies.`);}
        Object.defineProperty(changes,row.itemId,{value:quantity,enumerable:true,writable:true,configurable:true});
    }
    return changes;
}
