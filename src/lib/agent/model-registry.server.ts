import 'server-only';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { createAssistantMessageEventStream, type Api, type Model } from '@earendil-works/pi-ai';
import { emptyPiAssistant } from './pi-stream.server';
import type { PiStreamFn } from './types';

export function createGuardedAgentModels(model: Model<Api>, stream: PiStreamFn, authorize: () => Promise<void>) {
    const guarded: PiStreamFn = (selected, transcript, options) => {
        const output = createAssistantMessageEventStream();
        void (async () => {
            const signal = options?.signal;
            let cancel!: () => void;
            const cancelled = new Promise<never>((_resolve, reject) => { cancel = () => reject(new Error('MODEL_ABORTED')); });
            signal?.addEventListener('abort', cancel, { once: true });
            try {
                signal?.throwIfAborted();
                await Promise.race([authorize(), cancelled]);
                options?.signal?.throwIfAborted();
                const inner = stream(selected, transcript, options);
                const iterator = inner[Symbol.asyncIterator]();
                while (true) {
                    const next = await Promise.race([iterator.next(), cancelled]);
                    if (next.done) break;
                    output.push(next.value);
                }
                output.end(await Promise.race([inner.result(), cancelled]));
            } catch {
                const message = emptyPiAssistant(selected);
                message.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
                message.errorMessage = '模型调用失败或当前权限不可用';
                output.push({ type: 'error', reason: message.stopReason, error: message });
                output.end(message);
            } finally { signal?.removeEventListener('abort', cancel); }
        })();
        return output;
    };
    const models = createModels();
    models.setProvider(createProvider({ id: 'taibu', name: '太卜', models: [model], auth: { apiKey: { name: '服务端模型配置', resolve: async () => ({ auth: {} }) } }, api: { stream: guarded, streamSimple: guarded } }));
    return models;
}
