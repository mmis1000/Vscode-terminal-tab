import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { Terminal } from './terminal';
import { WebviewState } from './interface';

const TMUX_SOCK_NAME = 'vscode-terminal-tab';

function getDefaultShell() {
    return vscode.env.shell;
}

function getDefaultShellArgs() {
    const nodePlatform = os.platform();
    const type =
        nodePlatform === 'win32' ? 'windows'
            : nodePlatform === 'darwin' ? 'osx'
                : 'linux';

    return vscode.workspace.getConfiguration('terminal').get(`integrated.shellArgs.${type}`) as string[];
}

function getDefaultShellEnvs() {
    const nodePlatform = os.platform();
    const type =
        nodePlatform === 'win32' ? 'windows'
            : nodePlatform === 'darwin' ? 'osx'
                : 'linux';

    const defaultEnv = vscode.workspace.getConfiguration('terminal').get(`integrated.env.${type}`) as Record<string, string | null> | undefined;

    return defaultEnv || {};
}

function overrideShellEnv(original: Record<string, string>, patch: Record<string, string | null>) {
    const clone = { ...original };

    for (let key of Object.keys(patch)) {
        if (typeof patch[key] === 'string') {
            clone[key] = patch[key]!;
        }
        if (patch[key] === null) {
            delete clone[key];
        }
    }

    return clone;
}

let localeCache: string | null = null;

async function getLocale() {
    const nodePlatform = os.platform();
    const type =
        nodePlatform === 'win32' ? 'windows'
            : nodePlatform === 'darwin' ? 'osx'
                : 'linux';

    const [lang, country] = vscode.env.language.split('-');
    const language = country === undefined ? lang : lang + '_' + country.toUpperCase();
    const defaultLocale: string = language + '.UTF-8';

    const defaultEnglishLocale: string = 'en_US.UTF-8';

    if (type !== 'windows') {
        if (localeCache !== null) {
            vscodeConsole.appendLine('Using cached locale: ' + localeCache);
            return localeCache;
        }

        // try to infer locale
        try {
            const locales = await new Promise<string[]>((resolve, reject) => {
                child_process.execFile('locale', ['-a'], (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res.trim().split(/\r?\n/g).filter(it => it));
                    }
                });
            });

            // try to match against the locale
            const localesFormatted = locales.map(l => {
                const formatted = l.replace(/\.utf-?8/i, '.UTF-8');
                const isUTF8 = /\.utf-?8/i.test(l);
                return {
                    original: l,
                    isUTF8,
                    formatted
                };
            });

            let localeHit: string | null = null;

            const hitExact = localesFormatted.find(it => it.formatted.toLowerCase() === defaultLocale.toLowerCase());
            const hitEnglish = localesFormatted.find(it => it.formatted.toLowerCase() === defaultEnglishLocale.toLowerCase());
            const hitUTF8 = localesFormatted.find(it => it.isUTF8);
            const firstLocale = localesFormatted[0];

            if (hitExact !== undefined) {
                localeHit = hitExact.original;
            } else if (hitEnglish !== undefined) {
                localeHit = hitEnglish.original;
            } else if (hitUTF8 !== undefined) {
                localeHit = hitUTF8.original;
            } else if (firstLocale !== undefined) {
                localeHit = localesFormatted[0].original;
            } else {
                vscode.window.showWarningMessage(`Unable to determine locale, a default one generated from ide language is used`);
                localeHit = defaultLocale;
            }

            vscodeConsole.appendLine('Locale detected: ' + localeHit);
            localeCache = localeHit;
            return localeHit;
        } catch (e) {
            vscode.window.showWarningMessage(`Unable to determine locale, a default one generated from ide language is used`);
            localeCache = defaultLocale;
            return defaultLocale;
        }
    }

    return defaultLocale;
}

function escapeCommand(args: string[]) {
    return args.map(arg => {
        return "'" + arg.replace(/'/g, `'"'"'`) + "'";
    }).join(" ");
}

const vscodeConsole = vscode.window.createOutputChannel('Terminal Tab');

export class TerminalManager {
    static register(context: vscode.ExtensionContext) {
        const manager = new TerminalManager(context);
        manager.listen();
        return manager;
    }

    private terminals = new Map<string, Terminal>();

    private _themeEvent = new vscode.EventEmitter<void>();
    private onTheme = this._themeEvent.event;

    constructor(private context: vscode.ExtensionContext) { }

    listen() {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('terminaltab.createTerminal', async (fileUri) => {
                // Create and show a new webview
                const panel = vscode.window.createWebviewPanel(
                    'terminalTab.terminal', // Identifies the type of the webview. Used internally
                    'New terminal', // Title of the panel displayed to the user
                    vscode.ViewColumn.Active,
                    {
                        // Enable scripts in the webview
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    }
                );

                let cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '';

                if (fileUri instanceof vscode.Uri && fileUri.scheme === 'file') {
                    const stat = await fs.promises.stat(fileUri.fsPath);

                    if (stat.isFile()) {
                        cwd = path.dirname(fileUri.fsPath);
                    } else {
                        cwd = fileUri.fsPath;
                    }
                }

                this.createTerminal(
                    panel,
                    cwd,
                    getDefaultShell(),
                    getDefaultShellArgs(),
                    overrideShellEnv(
                        {
                            ...process.env as any,
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LANG: process.env.LANG || await getLocale(),
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            COLORTERM: 'truecolor'
                        },
                        getDefaultShellEnvs()
                    ),
                    null
                );
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('terminaltab.createTerminalPersistent', async (fileUri) => {
                // Create and show a new webview
                const panel = vscode.window.createWebviewPanel(
                    'terminalTab.terminal', // Identifies the type of the webview. Used internally
                    'New Tmux terminal', // Title of the panel displayed to the user
                    vscode.ViewColumn.One,
                    {
                        // Enable scripts in the webview
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    }
                );

                let cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '';

                if (fileUri instanceof vscode.Uri && fileUri.scheme === 'file') {
                    const stat = await fs.promises.stat(fileUri.fsPath);

                    if (stat.isFile()) {
                        cwd = path.dirname(fileUri.fsPath);
                    } else {
                        cwd = fileUri.fsPath;
                    }
                }

                this.createTerminal(
                    panel,
                    cwd,
                    getDefaultShell(),
                    getDefaultShellArgs(),
                    overrideShellEnv(
                        {
                            ...process.env as any,
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            LANG: process.env.LANG || await getLocale(),
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            COLORTERM: 'truecolor'
                        },
                        getDefaultShellEnvs()
                    ),
                    null,
                    true
                );
            })
        );

        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(ev => {
                if (
                    ev.affectsConfiguration('workbench.colorCustomizations') ||
                    ev.affectsConfiguration('workbench.colorTheme') ||
                    ev.affectsConfiguration('workbench.preferredDarkColorTheme') ||
                    ev.affectsConfiguration('workbench.preferredHighContrastColorTheme') ||
                    ev.affectsConfiguration('workbench.preferredLightColorTheme') ||
                    ev.affectsConfiguration('editor.fontFamily') ||
                    ev.affectsConfiguration('terminal.integrated.fontFamily') ||
                    ev.affectsConfiguration('editor.fontWeight') ||
                    ev.affectsConfiguration('terminal.integrated.fontWeight') ||
                    ev.affectsConfiguration('editor.fontSize') ||
                    ev.affectsConfiguration('terminal.integrated.fontSize')
                ) {
                    this._themeEvent.fire();
                }
            })
        );

        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveColorTheme(ev => {
                this._themeEvent.fire();
            })
        );

        class TerminalTabSerializer implements vscode.WebviewPanelSerializer {
            constructor(private _terminalManager: TerminalManager) { }
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: WebviewState | null) {
                // eslint-disable-next-line eqeqeq
                if (state == null) {
                    console.warn('Panel restored without state eliminated');
                    panel.dispose();
                    return;
                }

                this._terminalManager.createTerminal(
                    panel,
                    state.cwd,
                    state.shell,
                    state.args,
                    state.env,
                    state,
                    state.persistent
                );
            }
        }

        vscode.window.registerWebviewPanelSerializer('terminalTab', new TerminalTabSerializer(this));
        vscode.window.registerWebviewPanelSerializer('terminalTab.terminal', new TerminalTabSerializer(this));
    }

    createTerminal(
        panel: vscode.WebviewPanel,
        cwd: string,
        shell: string,
        args: string[],
        env: Record<string, string>,
        state: WebviewState | null,
        persistent = false
    ) {
        let webviewId: string | null = null;

        const ev = this.onTheme(() => {
            terminal.refreshTheme();
        });

        const terminal = new Terminal(
            this.context,
            panel,
            cwd,
            shell,
            args,
            env,
            state || {
                id: '',
                title: '',
                cwd,
                shell,
                args,
                env,
                visible: panel.visible,
                persistent
            },
            persistent ? (args) => {
                webviewId = args.webviewPayload.webviewId;

                vscodeConsole.appendLine('Attaching/creating using config');
                vscodeConsole.appendLine(escapeCommand([
                    'tmux',
                    '-L', TMUX_SOCK_NAME,
                    'new-session', '-A', '-s', args.webviewPayload.webviewId, escapeCommand([args.shell, ...args.args]), ';',
                    'set-option', 'status', 'off'
                ]));

                return {
                    cwd: args.cwd,
                    shell: 'tmux',
                    args: [
                        '-L', TMUX_SOCK_NAME,
                        'new-session', '-A', '-s', args.webviewPayload.webviewId, escapeCommand([args.shell, ...args.args]), ';',
                        'set-option', 'status', 'off'
                    ],
                    env: args.env
                };
            } : (args) => {
                return args;
            }
        );

        terminal.onId(id => {
            this.terminals.set(id, terminal);
            if (persistent) {
                vscodeConsole.appendLine(`Loaded Tmux terminal ${id}`);
            } else {
                vscodeConsole.appendLine(`Loaded terminal ${id}`);
            }
        });

        terminal.onDispose(() => {
            ev.dispose();

            for (let [k, v] of this.terminals.entries()) {
                if (terminal === v) {
                    this.terminals.delete(k);
                    break;
                }
            }

            if (persistent) {
                child_process.execFile('tmux', [
                    '-L', TMUX_SOCK_NAME,
                    'kill-session', '-t', webviewId!
                ], (err, res) => {
                    if (err) {
                        vscodeConsole.appendLine(`Error killing Tmux terminal ${webviewId} (probably process killed by user/system)`);
                        vscodeConsole.appendLine(err.stack || err.message);
                    } else {
                        vscodeConsole.appendLine(`Tmux terminal ${webviewId} killed successfully`);
                    }
                });
            } else {
                vscodeConsole.appendLine(`Terminal ${webviewId} exited`);
            }
        });
    }
}