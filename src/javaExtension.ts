import * as vscode from "vscode";
import { fetchResults, formatSortData, mergeSortResult, onDeactivateHandlers, sendPredictTelemetry, showInformationMessage } from "./extension";
import { localize } from "./i18n";
import { getInstance } from "./lang/commons";
import log from "./logger";

export function activateJava(context: vscode.ExtensionContext) {
    const redhatjavaExtension = vscode.extensions.getExtension("redhat.java");
    const msintellicode = vscode.extensions.getExtension("visualstudioexptteam.vscodeintellicode");
    let activated = false;
    async function _activate() {
        if (activated) {
            return;
        }
        activated = true;
        if (redhatjavaExtension) {
            log("AiX: redhat.java detected");
            if (!msintellicode) {
                if (!redhatjavaExtension.isActive) {
                    try {
                        await redhatjavaExtension.activate();
                    } catch (error) {
                        log("AiX: redhat.java activate failed reason:");
                        log(error);
                        vscode.window.showErrorMessage(localize("redhatjavaExtension.activate.fail") + error);
                    }
                }
                onDeactivateHandlers.push(() => {
                    vscode.commands.executeCommand("java.execute.workspaceCommand", "com.aixcoder.jdtls.extension.enable", true);
                });
                try {
                    await vscode.commands.executeCommand("java.execute.workspaceCommand", "com.aixcoder.jdtls.extension.enable", false);
                } catch (reason) {
                    log("AiX: com.aixcoder.jdtls.extension.enable command  failed reason:");
                    log(reason);
                }
                log("AiX: com.aixcoder.jdtls.extension.enable command success");
            } else {
                log("AiX: visualstudioexptteam.vscodeintellicode detected");
            }
        } else {
            showInformationMessage("redhatjavaExtension.install", "action.install").then((selection) => {
                if (selection === localize("action.install")) {
                    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse("vscode:extension/redhat.java"));
                }
            });
        }
    }

    const provider = {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, completionContext: vscode.CompletionContext): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
            await _activate();
            // log("=====================");
            try {
                const ext = vscode.workspace.getConfiguration().get("aiXcoder.model.java") as string;
                if (redhatjavaExtension) {
                    const fetchPromise = fetchResults(document, position, ext, "java");
                    const redhatPromise = vscode.commands.executeCommand("java.execute.workspaceCommand", "com.aixcoder.jdtls.extension.completion", {
                        textDocument: {
                            uri: document.uri.toString(),
                        },
                        position,
                        completionContext,
                    });
                    const { longResults, sortResults, fetchTime } = await fetchPromise;
                    const l = await redhatPromise as vscode.CompletionItem[];
                    mergeSortResult(l, sortResults, document);
                    longResults.push(...l);
                    sendPredictTelemetry(fetchTime, longResults);
                    return longResults;
                } else {
                    const { longResults, sortResults, fetchTime } = await fetchResults(document, position, ext, "java");
                    const sortLabels = formatSortData(sortResults, getInstance("java"), document);
                    longResults.push(...sortLabels);
                    sendPredictTelemetry(fetchTime, longResults);
                    return longResults;
                }
                // log("provideCompletionItems ends");
            } catch (e) {
                log(e);
            }
        },
        resolveCompletionItem(): vscode.ProviderResult<vscode.CompletionItem> {
            return null;
        },
    };
    const triggerCharacters = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "="];
    if (!msintellicode) {
        triggerCharacters.push(".");
    }
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: "java", scheme: "file" }, provider, ...triggerCharacters));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: "java", scheme: "untitled" }, provider, ...triggerCharacters));
}