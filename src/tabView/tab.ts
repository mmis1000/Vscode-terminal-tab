// eslint-disable-next-line @typescript-eslint/naming-convention
declare const Terminal: typeof import('xterm').Terminal;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const FitAddon: { FitAddon: typeof import('xterm-addon-fit').FitAddon };

declare const acquireVsCodeApi: any;

declare const preloadData: any;

(() => {
    function getCSSVariable (name: string) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name);
    }

    const vscode = acquireVsCodeApi();
    vscode.setState(preloadData);

    const foregroundColor = getCSSVariable('--vscode-terminal-foreground');
    const backgroundColor = getCSSVariable('--vscode-terminal-background') || getCSSVariable('--vscode-panel-background');

    const terminal = new Terminal({
        theme: {
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
        },
        fontSize: Number(getCSSVariable('--vscode-editor-font-size').replace('px', '')),
        fontWeight: getCSSVariable('--vscode-editor-font-weight') as any,
        fontFamily: getCSSVariable('--vscode-editor-font-family')
    });
    const fitAddon = new FitAddon.FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(document.getElementById('terminal')!);

    fitAddon.fit();

    window.addEventListener('resize', () => {
        fitAddon.fit();
    });

    window.addEventListener('message', evW => {
        const ev = evW.data;

        switch (ev.type) {
            case 'stdout': {
                terminal.write(
                    ev.data.type === 'Buffer'
                        ? new Uint8Array(ev.data.data)
                        : ev.data);

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

    vscode.postMessage({
        type: 'ready',
        data: {
            cols: terminal.cols,
            rows: terminal.rows
        }
    });
})();
