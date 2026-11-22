import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { DataService } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";

/** Isolates filesystem and HTTP effects while exercising the download's actual Promise lifecycle. */
function setupDownload () {
    const file = Object.assign(new PassThrough(), { close: vi.fn() });
    const request = new EventEmitter();
    const response = new PassThrough();
    vi.spyOn(fs, "createWriteStream").mockReturnValue(file as unknown as fs.WriteStream);
    vi.spyOn(fs, "unlink").mockImplementation((_path, callback) => callback(null));
    const get = vi.spyOn(https, "get").mockReturnValue(request as ClientRequest);
    const parser = new AbstractDataParser({ id: "test", sourceList: [] }, {} as DataService);
    const downloader = parser as unknown as { downloadImage: (url: string, destination: string) => Promise<boolean> };
    const promise = downloader.downloadImage("https://example.com/image.png", "test-image.png");
    const respond = () => {
        const callback = get.mock.calls[0].at(-1) as (message: IncomingMessage) => void;
        callback(response as unknown as IncomingMessage);
    };
    return { file, request, response, promise, respond };
}

describe("AbstractDataParser image download", () => {
    it("waits until all image data has been written", async () => {
        const { file, response, promise, respond } = setupDownload();
        const settled = vi.fn();
        const completion = promise.then(settled);
        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        respond();
        response.end("image contents");
        await expect(promise).resolves.toBe(true);
        await completion;
        expect(file.close).toHaveBeenCalledOnce();
        const written: unknown = file.read();
        expect(Buffer.isBuffer(written) && written.toString()).toBe("image contents");
    });

    it("rejects request failures and removes the incomplete download", async () => {
        const { request, promise } = setupDownload();
        const error = new Error("Connection failed");
        request.emit("error", error);
        await expect(promise).rejects.toBe(error);
        expect(fs.unlink).toHaveBeenCalledWith("test-image.png", expect.any(Function));
    });

    it("rejects destination stream errors", async () => {
        const { file, promise } = setupDownload();
        const error = new Error("Disk write failed");
        file.emit("error", error);
        await expect(promise).rejects.toBe(error);
    });

    it("rejects response stream errors", async () => {
        const { response, promise, respond } = setupDownload();
        const error = new Error("Response interrupted");
        respond();
        response.emit("error", error);
        await expect(promise).rejects.toBe(error);
    });
});
