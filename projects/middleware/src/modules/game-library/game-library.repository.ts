import { BSON, type Collection } from 'mongodb';
import type { UserGameLibrary } from '@lib/types';
import { emptyGameLibrary } from '@common/workspace/game-library';
import { ApiError } from '../../core/errors/app-error';
export type LibraryDocument = UserGameLibrary & {_id:string};
export class GameLibraryRepository {
    constructor(private readonly collection: Collection<LibraryDocument>) {}
    async read(user:string):Promise<UserGameLibrary> {
        const document=await this.collection.findOne({_id:user});
        if(!document) {return emptyGameLibrary();}
        const {_id: _owner,...library}=document;
        return library;
    }
    async save(user:string, library:UserGameLibrary):Promise<UserGameLibrary> {
        if(BSON.calculateObjectSize(library)>1024*1024) {throw new ApiError(413,'Game library is too large.');}
        const updated={...library,revision:library.revision+1};
        if(library.revision===0) {
            try {await this.collection.insertOne({_id:user,...updated});}
            catch(error) {if((error as {code?:number}).code===11000) {throw new ApiError(409,'Library changed in another tab. Reload before retrying.');} throw error;}
        } else {
            const result=await this.collection.updateOne({_id:user,revision:library.revision},{$set:updated});
            if(!result.matchedCount) {throw new ApiError(409,'Library changed in another tab. Reload before retrying.');}
        }
        return updated;
    }
}
