export const AGENT_STREAM_QUEUE_BYTES = 8 * 1024 * 1024;
export const AGENT_STREAM_IDLE_MS = 30_000;
export type AgentResync = { version: 1; runId: string; cursor: number; epoch: number; reason: 'epoch' | 'cursor' | 'gap' };

export function enqueueAgentFrame(controller: ReadableStreamDefaultController<Uint8Array>, frame: Uint8Array): boolean {
    if (frame.byteLength > (controller.desiredSize ?? 0)) {
        controller.error(new Error('AGENT_STREAM_BACKPRESSURE'));
        return false;
    }
    controller.enqueue(frame);
    return true;
}
