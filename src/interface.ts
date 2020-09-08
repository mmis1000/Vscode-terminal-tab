export interface ShellConfig {
    cwd: string
    shell: string
    args: string[]
    env: Record<string, string>
}

export interface WebviewReadyPayload {
    cols: number
    rows: number
    webviewId: string
}
export interface WebviewState {
    id: string
    title: string
    history?: string
    cwd: string
    shell: string
    args: string[]
    env: Record<string, string>
    persistent: boolean,
    visible: boolean,
    size?: {
        cols: number,
        rows: number
    }
}