// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
// import * as pty from 'node-pty';
import * as os from 'os';

/**
 * Returns a node module installed with VSCode, or null if it fails.
 */
function getCoreNodeModule(moduleName: string) {
    try {
        return require(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
    } catch (err) { }

    try {
        return require(`${vscode.env.appRoot}/node_modules/${moduleName}`);
    } catch (err) { }

    return null;
}

const pty = getCoreNodeModule('node-pty') as typeof import('node-pty');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('"terminaltab" is now active!');

    const getWebviewHTML = (panel: vscode.WebviewPanel, data: any = {}) => {
        function getWebViewPathString(...args: string[]) {
            const onDiskPath = vscode.Uri.file(
                path.join(context.extensionPath, ...args)
            );
            const URI = panel.webview.asWebviewUri(onDiskPath);
            return URI.toString();
        }

        const styles = [
            getWebViewPathString('node_modules', 'xterm', 'css', 'xterm.css'),
            getWebViewPathString('view', 'tabView', 'tab.css')
        ];

        const scripts = [
            getWebViewPathString('node_modules', 'xterm', 'lib', 'xterm.js'),
            getWebViewPathString('node_modules', 'xterm-addon-fit', 'lib', 'xterm-addon-fit.js'),
            getWebViewPathString('node_modules', 'xterm-addon-serialize', 'lib', 'xterm-addon-serialize.js'),
            getWebViewPathString('node_modules', 'xterm-addon-unicode11', 'lib', 'xterm-addon-unicode11.js'),
            getWebViewPathString('out', 'tabView', 'tab.js')
        ];

        return getWebviewContent(styles, scripts, data);
    };

    const spawnTerminal = (
        panel: vscode.WebviewPanel,
        cwd: string,
        cols: number,
        rows: number,
        env: Record<string, string>
    ) => {
        let terminal = pty.spawn(vscode.env.shell, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env
        });

        let exitHandler = terminal.onExit((ev) => {
            if (ev.exitCode !== 0) {
                vscode.window.showWarningMessage(`Terminal exited with ${ev.exitCode} due to signal ${ev.signal}`);
            }

            panel.dispose();
        });

        terminal.on('data', data => {
            panel.webview.postMessage({
                type: 'stdout',
                data: data
            });
        });

        return {
            terminal,
            exitHandler
        };
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('terminaltab.createTerminal', () => {
            // Create and show a new webview
            const panel = vscode.window.createWebviewPanel(
                'terminalTab', // Identifies the type of the webview. Used internally
                'Terminal', // Title of the panel displayed to the user
                vscode.ViewColumn.One,
                {
                    // Enable scripts in the webview
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );

            let con: import('node-pty').IPty | null = null;
            let exitHandler: null | import('node-pty').IDisposable = null;
            let disposed = false;

            panel.webview.onDidReceiveMessage(
                ev => {
                    switch (ev.type) {
                        case 'ready': {
                            // killed before the launch
                            if (disposed) {
                                return;
                            }
                            const res = spawnTerminal(
                                panel,
                                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '',
                                ev.data.cols,
                                ev.data.rows,
                                {
                                    ...process.env as any,
                                    // eslint-disable-next-line @typescript-eslint/naming-convention
                                    LANG: vscode.env.language.replace('-', '_') + '.UTF-8'
                                }
                            );

                            con = res.terminal;
                            exitHandler = res.exitHandler;
                            break;
                        }
                        case 'stdin': {
                            if (con === null) {
                                console.warn('terminal does not exist');
                                return;
                            }

                            con.write(ev.data.type === 'Buffer' ? Buffer.from(ev.data.data) : ev.data);
                        }
                        case 'resize': {
                            if (con === null) {
                                console.warn('terminal does not exist');
                                return;
                            }

                            con.resize(ev.data.cols, ev.data.rows);
                        }
                        default:
                    }
                },
                undefined,
                context.subscriptions
            );

            panel.webview.html = getWebviewHTML(panel, {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '',
                env: {
                    ...process.env as any,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    LANG: vscode.env.language.replace('-', '_') + '.UTF-8'
                }
            });

            panel.onDidDispose(() => {
                exitHandler?.dispose();
                exitHandler = null;
                disposed = true;
                con?.kill();
            });
        })
    );


    class TerminalTabSerializer implements vscode.WebviewPanelSerializer {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: any) {
            // eslint-disable-next-line eqeqeq
            if (state == null) {
                console.warn('Panel restored without state eliminated');
                panel.dispose();
                return;
            }

            console.log(state);

            let con: import('node-pty').IPty | null = null;
            let exitHandler: null | import('node-pty').IDisposable = null;
            let disposed = false;

            panel.webview.onDidReceiveMessage(
                ev => {
                    switch (ev.type) {
                        case 'ready': {
                            // killed before the launch
                            if (disposed) {
                                return;
                            }
                            const res = spawnTerminal(
                                panel,
                                state.cwd,
                                ev.data.cols,
                                ev.data.rows,
                                state.env
                            );

                            con = res.terminal;
                            exitHandler = res.exitHandler;
                            break;
                        }
                        case 'stdin': {
                            if (con === null) {
                                console.warn('terminal does not exist');
                                return;
                            }

                            con.write(ev.data.type === 'Buffer' ? Buffer.from(ev.data.data) : ev.data);
                        }
                        case 'resize': {
                            if (con === null) {
                                console.warn('terminal does not exist');
                                return;
                            }

                            con.resize(ev.data.cols, ev.data.rows);
                        }
                        default:
                    }
                },
                undefined,
                context.subscriptions
            );

            panel.webview.html = getWebviewHTML(panel, state);

            panel.onDidDispose(() => {
                exitHandler?.dispose();
                exitHandler = null;
                disposed = true;
                con?.kill();
            });
        }
    }

    vscode.window.registerWebviewPanelSerializer('terminalTab', new TerminalTabSerializer());
}

// this method is called when your extension is deactivated
export function deactivate() { }


function getWebviewContent(stylePath: string[], scriptPath: string[], preload = {}) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
    <script>
        const preloadData = ${JSON.stringify(preload).replace('<script', '<\\script')}
    </script>
    ${
        stylePath.map(s => `<link rel="stylesheet" href="${s}">`).join('\r\n')
        }
</head>
<body>
    <div id="terminal"></div>
    ${
        scriptPath.map(s => `<script src="${s}"></script>`).join('\r\n')
        }
</body>
</html>`;
}