import type { TelemetryConfig, TelemetryEventName, TelemetryState } from "./types.js";
export declare class TelemetryClient {
    private queue;
    private readonly config;
    private readonly stateFactory;
    private readonly version;
    private state;
    private flushInterval;
    constructor(config: TelemetryConfig, stateFactory: () => TelemetryState, version: string);
    track(eventName: TelemetryEventName, dimensions?: Record<string, string | number | boolean>): void;
    flush(): Promise<void>;
    startPeriodicFlush(intervalMs?: number): void;
    stop(): void;
    hashPrivateRef(value: string): string;
    private getState;
    private resolveEndpoints;
}
//# sourceMappingURL=client.d.ts.map