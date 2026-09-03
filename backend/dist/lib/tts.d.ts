/** 朗读音色（与前端 StoryParams.voice 对应） */
export type TtsVoice = 'daddy' | 'mommy' | 'grandpa' | 'grandma';
export declare function normalizeVoice(v: unknown): TtsVoice;
export declare const TTS_DIR: string;
export declare function audioFilePath(hash: string): string;
export declare function audioUrl(hash: string): string;
export declare function cachedAudioPath(text: string, lang?: string, voice?: TtsVoice): {
    hash: string;
    path: string;
    url: string;
};
/** 调用 TTS 生成 MP3；网络不可用时返回 null */
export declare function synthesize(text: string, lang?: string, voice?: TtsVoice): Promise<Buffer | null>;
/** 确保某段文本有缓存的音频文件；返回音频 URL，失败返回 null */
export declare function ensureAudio(text: string, lang?: string, voice?: TtsVoice): Promise<string | null>;
/** 单页语音生成，失败自动重试若干次（弱网/抖动时很关键），返回 URL 或 null */
export declare function ensureAudioWithRetry(text: string, lang?: string, attempts?: number, voice?: TtsVoice): Promise<string | null>;
/** 为整个故事生成音频，返回每页对应的 URL（失败的页面为 null） */
export declare function generateStoryAudio(pages: {
    text: string;
}[], lang?: string, voice?: TtsVoice): Promise<(string | null)[]>;
//# sourceMappingURL=tts.d.ts.map