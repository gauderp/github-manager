import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export function loadOrCreateState(stateDir, version) {
    const filePath = path.join(stateDir, "state.json");
    if (existsSync(filePath)) {
        try {
            const raw = readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed.installId && parsed.salt) {
                return parsed;
            }
        }
        catch {
            // Corrupted state file — recreate
        }
    }
    const state = {
        installId: randomUUID(),
        salt: randomBytes(32).toString("hex"),
        createdAt: new Date().toISOString(),
        firstSeenVersion: version,
    };
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
    return state;
}
//# sourceMappingURL=state.js.map