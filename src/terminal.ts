
import * as vscode from 'vscode';
import * as path from 'path';
import { ShellConfig, WebviewReadyPayload, WebviewState } from './interface';

const pty = getCoreNodeModule('node-pty') as typeof import('node-pty');

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

export class Terminal {
    private con: import('node-pty').IPty | null = null;
    private exitHandler: null | import('node-pty').IDisposable = null;

    private _idEvent = new vscode.EventEmitter<string>();
    onId = this._idEvent.event;

    private _disposeEvent = new vscode.EventEmitter<void>();
    onDispose = this._disposeEvent.event;

    constructor(
        private context: vscode.ExtensionContext,
        private panel: vscode.WebviewPanel,
        private cwd: string,
        private shell: string,
        private args: string[],
        private env: Record<string, string>,
        private initialState: WebviewState,
        private ptyArgsDelegate?: { (original: ShellConfig & { state: WebviewState, webviewPayload: WebviewReadyPayload }): ShellConfig }
    ) {
        this.setupTerminalWebview();
    }

    getWebviewContent(stylePath: string[], scriptPath: string[], preload: WebviewState) {
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

    getWebviewHTML(data: WebviewState) {
        const getWebViewPathString = (...args: string[]) => {
            const onDiskPath = vscode.Uri.file(
                path.join(this.context.extensionPath, ...args)
            );
            const URI = this.panel.webview.asWebviewUri(onDiskPath);
            return URI.toString();
        };

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

        return this.getWebviewContent(styles, scripts, data);
    }

    setupTerminalWebview() {
        let disposed = false;

        const setTitle = (title: string) => {
            if (title.length > 20) {
                this.panel.title = title.slice(0, 5) + '...' + title.slice(title.length - 15, title.length);
            } else {
                this.panel.title = title;
            }
        };


        this.panel.iconPath = {
            dark: vscode.Uri.file(
                path.join(this.context.extensionPath, 'view', 'tabView', 'codicons-terminal-light.svg')
            ),
            light: vscode.Uri.file(
                path.join(this.context.extensionPath, 'view', 'tabView', 'codicons-terminal-dark.svg')
            )
        };

        this.panel.webview.onDidReceiveMessage(
            ev => {
                switch (ev.type) {
                    case 'ready': {
                        // killed before the launch
                        if (disposed) {
                            return;
                        }

                        const data = ev.data as WebviewReadyPayload;

                        this._idEvent.fire(data.webviewId);

                        this.initiatePty(
                            data.cols,
                            data.rows,
                            data
                        );

                        break;
                    }
                    case 'stdin': {
                        if (this.con === null) {
                            console.warn('terminal does not exist');
                            return;
                        }

                        this.con.write(ev.data.type === 'Buffer' ? Buffer.from(ev.data.data) : ev.data);
                    }
                    case 'resize': {
                        if (this.con === null) {
                            console.warn('terminal does not exist');
                            return;
                        }

                        this.con.resize(ev.data.cols, ev.data.rows);
                    }
                    case 'title': {
                        setTitle(ev.data.title);
                    }
                    default:
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.webview.html = this.getWebviewHTML({
            ...this.initialState,
            visible: this.panel.visible
        });

        this.panel.onDidChangeViewState(() => {
            this.panel.webview.postMessage({
                type: 'viewStateChange',
                data: {
                    visible: this.panel.visible
                }
            });
        });

        this.panel.onDidDispose(() => {
            this.exitHandler?.dispose();
            this.exitHandler = null;
            disposed = true;
            this.con?.kill();
            this._disposeEvent.fire();
        });

        if (this.initialState?.title) {
            setTitle(this.initialState?.title);
        }
    }

    initiatePty(
        cols: number,
        rows: number,
        /** data object from the terminal */
        data: WebviewReadyPayload
    ) {
        const config: ShellConfig = this.ptyArgsDelegate
            ? this.ptyArgsDelegate({
                cwd: this.cwd,
                shell: this.shell,
                args: this.args,
                env: this.env,
                state: this.initialState,
                webviewPayload: data
            })
            : {
                cwd: this.cwd,
                shell: this.shell,
                args: this.args,
                env: this.env
            };

        let terminal = pty.spawn(config.shell, config.args, {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: config.cwd,
            env: config.env
        });

        this.exitHandler = terminal.onExit((ev) => {
            if (ev.exitCode !== 0) {
                vscode.window.showWarningMessage(`Terminal exited with ${ev.exitCode} due to signal ${ev.signal}`);
            }

            this.panel.dispose();
        });

        terminal.on('data', data => {
            this.panel.webview.postMessage({
                type: 'stdout',
                data: data
            });
        });

        this.con = terminal;
    }

    refreshTheme() {
        this.panel.webview.postMessage({
            type: 'themeChange'
        });
    }
}
