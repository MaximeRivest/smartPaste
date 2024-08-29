import * as vscode from 'vscode';

interface DiffChunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
}

function parseDiff(diffContent: string): DiffChunk[] {
    const chunks: DiffChunk[] = [];
    const lines = diffContent.split('\n');
    let currentChunk: DiffChunk | null = null;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            if (currentChunk) {
                chunks.push(currentChunk);
            }
            const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
            if (match) {
                currentChunk = {
                    oldStart: parseInt(match[1]),
                    oldLines: match[2] ? parseInt(match[2]) : 1,
                    newStart: parseInt(match[3]),
                    newLines: match[4] ? parseInt(match[4]) : 1,
                    lines: []
                };
            }
        } else if (currentChunk) {
            currentChunk.lines.push(line);
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}


function generateDiffPreview(diff: DiffChunk[]): string {
    let preview = '';
    for (const chunk of diff) {
        preview += `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@\n`;
        for (const line of chunk.lines) {
            if (line.startsWith('+')) {
                preview += `$(add) ${line}\n`;
            } else if (line.startsWith('-')) {
                preview += `$(remove) ${line}\n`;
            } else {
                preview += `$(circle-outline) ${line}\n`;
            }
        }
        preview += '\n';
    }
    return preview;
}

async function showDiffPreview(diff: DiffChunk[]): Promise<boolean> {
    const preview = generateDiffPreview(diff);
    const result = await vscode.window.showInformationMessage(
        'Review the changes below:',
        { modal: true, detail: preview },
        'Apply Changes',
        'Cancel'
    );
    return result === 'Apply Changes';
}

function applyDiff(document: vscode.TextDocument, diff: DiffChunk[]): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    for (const chunk of diff) {
        const startPos = document.positionAt(document.offsetAt(new vscode.Position(chunk.oldStart - 1, 0)));
        const endPos = document.positionAt(document.offsetAt(new vscode.Position(chunk.oldStart - 1 + chunk.oldLines, 0)));
        const newText = chunk.lines.filter(line => !line.startsWith('-')).map(line => line.substr(1)).join('\n');
        
        edits.push(vscode.TextEdit.replace(new vscode.Range(startPos, endPos), newText));
    }

    return edits;
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.smartPaste', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const clipboardContent = await vscode.env.clipboard.readText();
        const diffChunks = parseDiff(clipboardContent);

        if (diffChunks.length === 0) {
            vscode.window.showInformationMessage('No valid diff content found in clipboard');
            return;
        }

        const userAccepted = await showDiffPreview(diffChunks);

        if (userAccepted) {
            const edits = applyDiff(editor.document, diffChunks);
            const edit = new vscode.WorkspaceEdit();
            edit.set(editor.document.uri, edits);

            vscode.workspace.applyEdit(edit).then(success => {
                if (success) {
                    vscode.window.showInformationMessage('Smart Paste applied successfully');
                } else {
                    vscode.window.showErrorMessage('Failed to apply Smart Paste');
                }
            });
        } else {
            vscode.window.showInformationMessage('Smart Paste cancelled');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}