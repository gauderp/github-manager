/**
 * Shared UI component declarations for plugin frontends.
 *
 * These components are exported from `@paperclipai/plugin-sdk/ui` and are
 * provided by the host at runtime.  They match the host's design tokens and
 * visual language, reducing the boilerplate needed to build consistent plugin UIs.
 *
 * **Plugins are not required to use these components.**  They exist to reduce
 * boilerplate and keep visual consistency. A plugin may render entirely custom
 * UI using any React component library.
 *
 * Component implementations are provided by the host — plugin bundles contain
 * only the type declarations; the runtime implementations are injected via the
 * host module registry.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components In `@paperclipai/plugin-sdk/ui`
 */
import { renderSdkUiComponent } from "./runtime.js";
// ---------------------------------------------------------------------------
// Component declarations (provided by host at runtime)
// ---------------------------------------------------------------------------
// These are declared as ambient values so plugin TypeScript code can import
// and use them with full type-checking. The host's module registry provides
// the concrete React component implementations at bundle load time.
/**
 * Displays a single metric with an optional trend indicator and sparkline.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
function createSdkUiComponent(name) {
    return function PaperclipSdkUiComponent(props) {
        return renderSdkUiComponent(name, props);
    };
}
export const MetricCard = createSdkUiComponent("MetricCard");
/**
 * Displays an inline status badge (ok / warning / error / info / pending).
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const StatusBadge = createSdkUiComponent("StatusBadge");
/**
 * Sortable, paginated data table.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const DataTable = createSdkUiComponent("DataTable");
/**
 * Line or bar chart for time-series data.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const TimeseriesChart = createSdkUiComponent("TimeseriesChart");
/**
 * Renders Markdown text as HTML.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const MarkdownBlock = createSdkUiComponent("MarkdownBlock");
/**
 * Renders Paperclip's shared Markdown editor.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const MarkdownEditor = createSdkUiComponent("MarkdownEditor");
/**
 * Renders a definition-list of label/value pairs.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const KeyValueList = createSdkUiComponent("KeyValueList");
/**
 * Row of action buttons wired to the plugin bridge's `performAction` handlers.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const ActionBar = createSdkUiComponent("ActionBar");
/**
 * Scrollable, timestamped log output viewer.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const LogView = createSdkUiComponent("LogView");
/**
 * Collapsible JSON tree for debugging or raw data inspection.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const JsonTree = createSdkUiComponent("JsonTree");
/**
 * Loading indicator.
 *
 * @see PLUGIN_SPEC.md §19.6 — Shared Components
 */
export const Spinner = createSdkUiComponent("Spinner");
/**
 * React error boundary that prevents plugin rendering errors from crashing
 * the host page.
 *
 * @see PLUGIN_SPEC.md §19.7 — Error Propagation Through The Bridge
 */
export const ErrorBoundary = createSdkUiComponent("ErrorBoundary");
/**
 * Renders the host file tree component with a stable plugin-safe prop surface.
 *
 * @example
 * ```tsx
 * import { FileTree, type FileTreeNode } from "@paperclipai/plugin-sdk/ui";
 *
 * const nodes: FileTreeNode[] = [
 *   { name: "README.md", path: "README.md", kind: "file", children: [] },
 * ];
 *
 * <FileTree nodes={nodes} onSelectFile={(path) => console.log(path)} />;
 * ```
 */
export const FileTree = createSdkUiComponent("FileTree");
/**
 * Renders Paperclip's native issue list component for company-scoped plugin
 * pages that need a standard board issue view.
 */
export const IssuesList = createSdkUiComponent("IssuesList");
/**
 * Renders the same host assignee picker used by the new issue pane.
 */
export const AssigneePicker = createSdkUiComponent("AssigneePicker");
/**
 * Renders the same host project picker used by the new issue pane.
 */
export const ProjectPicker = createSdkUiComponent("ProjectPicker");
/**
 * Renders Paperclip's native managed routines list for plugin settings pages.
 */
export const ManagedRoutinesList = createSdkUiComponent("ManagedRoutinesList");
//# sourceMappingURL=components.js.map