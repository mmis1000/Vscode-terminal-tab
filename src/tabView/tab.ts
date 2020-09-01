// eslint-disable-next-line @typescript-eslint/naming-convention
declare const Terminal: { new(): import('xterm').Terminal };
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const FitAddon: { FitAddon: { new(): import('xterm-addon-fit').FitAddon } };

declare const acquireVsCodeApi: any;

(() => {
    const vscode = acquireVsCodeApi();
    const terminal = new Terminal();
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
