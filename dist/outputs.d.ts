export interface ReleaseNoteEntry {
    description: string;
    pr: number;
    author: string;
    tag?: string;
}
export interface UncertainEntry {
    description: string;
    pr: number;
    author: string;
    reason: string;
    tag?: string;
}
export interface SkippedPR {
    pr: number;
    title: string;
    reason: string;
}
export interface ParsedOutput {
    entries: ReleaseNoteEntry[];
    uncertainEntries: UncertainEntry[];
    skippedPRs: SkippedPR[];
}
/**
 * Parse the Copilot CLI output to extract the structured JSON.
 */
export declare function parseOutput(stdout: string): ParsedOutput;
/**
 * Format release notes as markdown text.
 * Groups entries by tag when tags are present.
 */
export declare function formatAsMarkdown(output: ParsedOutput): string;
/**
 * Set the GitHub Action outputs.
 */
export declare function setOutputs(output: ParsedOutput): void;
