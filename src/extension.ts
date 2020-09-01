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
	console.log('Congratulations, your extension "terminaltab" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('terminaltab.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from TerminalTab!');
	});

	context.subscriptions.push(disposable);

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
				getWebViewPathString('out', 'tabView', 'tab.js')
			];

			let con: import('node-pty').IPty | null = null;
			let exitHandler: null | import('node-pty').IDisposable = null;

			panel.webview.onDidReceiveMessage(
				ev => {
					switch (ev.type) {
						case 'ready': {
							const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'] as string;
							con = pty.spawn(shell, [], {
								name: 'xterm-color',
								cols: ev.data.cols,
								rows: ev.data.rows,
								cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME,
								env: process.env as any
							});

							exitHandler = con.onExit((ev) => {
								if (ev.exitCode !== 0) {
									vscode.window.showWarningMessage(`Terminal exited with ${ev.exitCode} due to signal ${ev.signal}`);
								}
							});

							con.on('data', data => {
								panel.webview.postMessage({
									type: 'stdout',
									data: data
								});
							});

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
					console.log(JSON.stringify(ev));
					if (ev.type === 'Buffer') {
						panel.webview.postMessage(Buffer.from(ev.data as number[]));
					} else {
						panel.webview.postMessage(ev);
					}
				},
				undefined,
				context.subscriptions
			);

			panel.webview.html = getWebviewContent(styles, scripts);

			panel.onDidDispose(() => {
				exitHandler?.dispose();
				exitHandler = null;
				con?.kill();
			});
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }


function getWebviewContent(stylePath: string[], scriptPath: string[]) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Cat Coding</title>
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