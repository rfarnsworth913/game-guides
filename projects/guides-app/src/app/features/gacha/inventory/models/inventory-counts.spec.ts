import {parseInventoryCounts} from './inventory-counts';
import type {Entry} from '@lib/types/workspace.type';
const item:Entry={id:'ore',game:'genshin',kind:'inventory',name:'Ore',notes:'',quantity:3,target:0,completed:false,rarity:1,category:'Materials',members:[],requirements:[],order:0,day:'',maxStack:100};
describe('Inventory count imports',()=>{
    it('accepts JSON maps, record arrays and CSV without mutating existing counts',()=>{
        for(const text of ['{"ore": 25}','[{"itemId":"ore","quantity":25}]','itemId,quantity\nore,25','ore,25']){expect(parseInventoryCounts(text,[item],'genshin')).toEqual({ore:25});}
        expect(item.quantity).toBe(3);
    });
    it('rejects unknown, wrong-game and non-inventory items before applying any changes',()=>{
        expect(()=>parseInventoryCounts('{"ore": 25,"missing": 1}',[item],'genshin')).toThrow('Unknown');
        expect(()=>parseInventoryCounts('{"ore": 25}',[item],'hsr')).toThrow('Unknown');
        expect(()=>parseInventoryCounts('{"ore": 25}',[{...item,kind:'plans'}],'genshin')).toThrow('Unknown');
    });
    it('rejects invalid quantities, duplicate rows, extra fields and malformed files',()=>{
        for(const text of ['','{}','not,a,count','{"ore": -1}','{"ore": 1.5}','{"ore": 101}','{"ore": "25"}','ore,1\nore,2','[{"itemId":"ore","quantity":1,"game":"hsr"}]','{']){expect(()=>parseInventoryCounts(text,[item],'genshin')).toThrow();}
    });
    it('keeps equipment counts at least as high as the number of owned copies',()=>{
        const equipment={...item,equipmentInstances:[{id:'copy',current:{level:1,gear:{},progression:{}}}]};
        expect(()=>parseInventoryCounts('{"ore": 0}',[equipment],'genshin')).toThrow('owned equipment');
        expect(parseInventoryCounts('{"ore": 1}',[equipment],'genshin')).toEqual({ore:1});
    });
});
