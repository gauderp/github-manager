import type { BindMode, DeploymentExposure, DeploymentMode } from "./constants.js";
export declare const LOOPBACK_BIND_HOST = "127.0.0.1";
export declare const ALL_INTERFACES_BIND_HOST = "0.0.0.0";
export declare function isLoopbackHost(host: string | null | undefined): boolean;
export declare function isAllInterfacesHost(host: string | null | undefined): boolean;
export declare function inferBindModeFromHost(host: string | null | undefined, opts?: {
    tailnetBindHost?: string | null | undefined;
}): BindMode;
export declare function validateConfiguredBindMode(input: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bind?: BindMode | null | undefined;
    host?: string | null | undefined;
    customBindHost?: string | null | undefined;
}): string[];
export declare function resolveRuntimeBind(input: {
    bind?: BindMode | null | undefined;
    host?: string | null | undefined;
    customBindHost?: string | null | undefined;
    tailnetBindHost?: string | null | undefined;
}): {
    bind: BindMode;
    host: string;
    customBindHost?: string;
    errors: string[];
};
//# sourceMappingURL=network-bind.d.ts.map