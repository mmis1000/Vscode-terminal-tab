# Terminal Tab

<a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/github/license/mmis1000/Vscode-terminal-tab?color=green&style=flat-square&label=License" />
</a>
<a href="https://marketplace.visualstudio.com/items?itemName=mmis1000-personal.terminaltab">
    <img src="https://img.shields.io/visual-studio-marketplace/v/mmis1000-personal.terminaltab?color=green&label=VS%20Marketplace&style=flat-square" />
</a>

This extension is a experiment about terminal in editor tab experience. 

![The extension](./demo.png)

## Features

Besides open the terminal as an editor tab.  
It is also experiment of

1. auto recover tab (its cwd and env) on load workspace
2. auto recover terminal content after recover the tag (just like iterm 2)

## Requirements

You need to have access to shell env. (or you can't open terminal)

## Extension Settings

No

## Known Issues

Integration with the vscode is lacking because there is no api for that.  
The tab looks more like a terminal that live in vscode by accident.

## Release Notes

### 0.0.2

Update description only

### 0.0.1

Initial publish

## See Also

Github Issue: [Tabs for integrated terminal](https://github.com/microsoft/vscode/issues/10546)  
Github Issue: [Retain terminal processes between window reloads](https://github.com/microsoft/vscode/issues/20013)