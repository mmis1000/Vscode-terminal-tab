// eslint-disable-next-line @typescript-eslint/naming-convention
declare const Terminal: typeof import('xterm').Terminal;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const FitAddon: { FitAddon: typeof import('xterm-addon-fit').FitAddon };
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const SerializeAddon: { SerializeAddon: typeof import('xterm-addon-serialize').SerializeAddon };
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const Unicode11Addon: { Unicode11Addon: typeof import('xterm-addon-unicode11').Unicode11Addon };

declare const acquireVsCodeApi: any;

declare const preloadData: import('../interface').WebviewState;

(async () => {
    function getCSSVariable(name: string) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name);
    }

    const vscode = acquireVsCodeApi();

    function saveHandler() {
        currentState.history = serializeAddon.serialize();
        vscode.setState(currentState);
    }

    let saveTimer: ReturnType<typeof setTimeout> = null!;

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveHandler, 1000);
    }


    let currentState: import('../interface').WebviewState = JSON.parse(JSON.stringify(preloadData));

    function updateStateThrottled (fn: (state: import('../interface').WebviewState) => void) {
        fn(currentState);
        scheduleSave();
    }

    //#region webview-id
    const webviewId = preloadData.id || Math.random().toString(16).slice(2);
    currentState.id = webviewId;
    vscode.setState(currentState);
    //#endregion  webview-id

    //#region terminal-setup

    const getTheme = () => {
        const foregroundColor = getCSSVariable('--vscode-terminal-foreground');
        const backgroundColor = getCSSVariable('--vscode-terminal-background') || getCSSVariable('--vscode-panel-background');

        return  {
            foreground: foregroundColor,
            background: backgroundColor,

            brightBlack: getCSSVariable('--vscode-terminal-ansiBrightBlack'),
            brightBlue: getCSSVariable('--vscode-terminal-ansiBrightBlue'),
            brightCyan: getCSSVariable('--vscode-terminal-ansiBrightCyan'),
            brightGreen: getCSSVariable('--vscode-terminal-ansiBrightGreen'),
            brightMagenta: getCSSVariable('--vscode-terminal-ansiBrightMagenta'),
            brightRed: getCSSVariable('--vscode-terminal-ansiBrightRed'),
            brightWhite: getCSSVariable('--vscode-terminal-ansiBrightWhite'),
            brightYellow: getCSSVariable('--vscode-terminal-ansiBrightYellow'),

            black: getCSSVariable('--vscode-terminal-ansiBlack'),
            blue: getCSSVariable('--vscode-terminal-ansiBlue'),
            cyan: getCSSVariable('--vscode-terminal-ansiCyan'),
            green: getCSSVariable('--vscode-terminal-ansiGreen'),
            magenta: getCSSVariable('-vscode-terminal-ansiMagenta'),
            red: getCSSVariable('--vscode-terminal-ansiRed'),
            white: getCSSVariable('--vscode-terminal-ansiWhite'),
            yellow: getCSSVariable('--vscode-terminal-ansiYellow'),

            selection: getCSSVariable('--vscode-terminal-selectionBackground'),

            cursor: getCSSVariable('--vscode-terminalCursor-foreground') || foregroundColor,
            cursorAccent: getCSSVariable('--vscode-terminalCursor-foreground') || backgroundColor
        };
    };

    const getConfig = () => {
        return {
            theme: getTheme(),
            fontSize: Number(getCSSVariable('--vscode-editor-font-size').replace('px', '')),
            fontWeight: getCSSVariable('--vscode-editor-font-weight') as any,
            fontFamily: getCSSVariable('--vscode-editor-font-family')
        };
    };

    const terminal = (window as any).terminal = new Terminal(getConfig());

    const fitAddon = new FitAddon.FitAddon();
    const serializeAddon = new SerializeAddon.SerializeAddon();
    const unicode11Addon = new Unicode11Addon.Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(unicode11Addon);
    // activate the new version
    terminal.unicode.activeVersion = '11';
    //#endregion terminal-setup

    // ignore history write back for persistent terminal because the host is responsible for that
    if (!currentState.persistent && preloadData.history) {
        if (preloadData.size) {
            terminal.resize(preloadData.size.cols, preloadData.size.rows);
        }

        const RMCUP = '\u001b[?1049l';
        const RESET_STYLE = '\u001b[0m';

        let appends = RESET_STYLE;

        // Do this only when we are in alternative screen
        if (preloadData.history.indexOf('\u001b[?1049h') >= 0) {
            appends += RMCUP;
        }

        await new Promise(resolve => {
            terminal.write(
                preloadData.history 
                + appends
                + `\r\n\x1b[49;90mSession Contents Restored on ${new Date()}\x1b[m\r\n`,
                resolve
            );
        });
    }

    terminal.open(document.getElementById('terminal')!);


    const hasWindowSize = () => {
        return window.innerWidth > 0 && window.innerHeight > 0;
    };

    function updateSize() {
        if (!hasWindowSize()) {
            // for some reason, the windows size is incorrect
            return;
        }

        fitAddon.fit();

        updateStateThrottled(state => {
            state.size = {
                cols: terminal.cols,
                rows: terminal.rows
            };
        });
    }

    if (currentState.visible) {
        updateSize();
        console.log('fitting size');
        console.log('new dimension', terminal.cols, terminal.rows);
    } else if (currentState.size) {
        console.log('old dimension', currentState.size.cols, currentState.size.rows);
        terminal.resize(
            currentState.size.cols,
            currentState.size.rows
        );
    } else {
        console.log('hold until dimension is known');
    }

    window.addEventListener('resize', () => {
        if (currentState.visible) {
            updateSize();
            console.log('fitting size');
            console.log('new dimension', terminal.cols, terminal.rows);
        } else {
            console.log('ignore size change because terminal is invisible');
        }
    });

    window.addEventListener('message', evW => {
        const ev = evW.data;

        switch (ev.type) {
            case 'stdout': {
                // ignore history save for persistent terminal because the host is responsible for that
                if (!currentState.persistent) {
                    scheduleSave();
                }

                terminal.write(
                    ev.data.type === 'Buffer'
                        ? new Uint8Array(ev.data.data)
                        : ev.data);

                break;
            }
            case 'viewStateChange': {
                updateStateThrottled(state => {
                    state.visible = ev.data.visible;
                });

                if (ev.data.visible) {
                    fitAddon.fit();
                }
                break;
            }
            case 'themeChange': {
                const newConfig = getConfig();

                for (let key of Object.keys(newConfig)) {
                    terminal.setOption(key, (newConfig as any)[key]);
                }

                if (currentState.visible) {
                    updateSize();
                }
                break;
            }
            default:
        }
    });

    terminal.onData(data => {
        vscode.postMessage({
            type: 'stdin',
            data: data
        });
    });

    terminal.onResize(({ cols, rows }) => {
        vscode.postMessage({
            type: 'resize',
            data: {
                cols,
                rows
            }
        });
    });

    const readyData: import('../interface').WebviewReadyPayload = {
        cols: currentState?.size?.cols ?? terminal.cols,
        rows: currentState?.size?.rows ?? terminal.rows,
        webviewId
    };

    vscode.postMessage({
        type: 'ready',
        data: readyData
    });

    terminal.onTitleChange(title => {
        updateStateThrottled(state => {
            state.title = title;
        });

        vscode.postMessage({
            type: 'title',
            data: {
                title: title
            }
        });
    });
})();
