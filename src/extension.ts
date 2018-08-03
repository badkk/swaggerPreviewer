'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const fs = require('fs-extra');
const process = require('process');
const path = require('path');
const replace = require('replace-in-file');
const spawn = require('child-process-promise').spawn;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
const prodNamePattern = '{product_name}';
const swaggerPathPattern = '{swagger_path}';
const srcPath = 'C:/.tmp/template';
const newSamplePath = srcPath + '/sample';
// TODO: absolute path
const templatePath = 'C:/Users/zifan/source/repos/hackthon/swaggerpreviewer/src/restSample';
const splitterExecutor = 'C:/Users/zifan/source/repos/hackthon/swaggerpreviewer/src/restProcessor/RestProcessor.exe';

let productName = '';
const generateHtmlPath = newSamplePath + '/_site/rest-ref-template/default/api/azure_advisor';
const localBuildPath = newSamplePath + '/.optemp/packages.config';

const out = vscode.window.showInformationMessage;
const error = vscode.window.showErrorMessage;
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "swaggerpreviewer" is now active!');

    const editor = vscode.window.activeTextEditor;
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let previewHtml = vscode.commands.registerCommand('extension.Preview', async () => {
        try {
            if (editor) {
                const swaggerFilePath = editor.document.fileName;
                if(swaggerFilePath.split('.').pop() === 'json') {
                    console.log("run json");
                    await preprocessing(swaggerFilePath);
                    await run(swaggerFilePath);
                }
            }
        } catch (ex) {
            error('Error happends.');
        }
    });

    vscode.window.onDidChangeTextEditorSelection(async (e: vscode.TextEditorSelectionChangeEvent) => {
		if (e.textEditor === vscode.window.activeTextEditor) {
            const generatedYamlPath = e.textEditor.document.fileName;
            if (generatedYamlPath.split('.').pop() === 'yml') {
                console.log("select yml");
                await preview(generatedYamlPath, e.textEditor.document);
            }
        }
	});

    context.subscriptions.push(previewHtml);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
async function preprocessing(swaggerPath: string) {
    out(`Start file dealing with ${swaggerPath} ...`);
    //0. preparing
    productName = path.basename(swaggerPath).split('.')[0];
    const newSwaggerFilePath = `${srcPath}/${productName}.json`;
    await fs.ensureDir(newSamplePath + "/target");
    await fs.ensureDir(newSamplePath + "/structured");
    //1. copy folder
    await fs.copy(templatePath, newSamplePath);
    await fs.copy(swaggerPath, newSwaggerFilePath);
    //2. change files
    await replaceFile(newSamplePath + '/mapping.json', prodNamePattern, productName);
    await replaceFile(newSamplePath + '/mapping.json', swaggerPathPattern, `${productName}.json`);
    await replaceFile(newSamplePath + '/docfx.json', prodNamePattern, productName);
    out('File dealing done.');
}

async function run(swaggerFile: string) {
    try {
        const swaggerFolder = path.dirname(swaggerFile);
        console.log(swaggerFolder);
        out('Start running rest splitter...');
        await spawnProcess(splitterExecutor, [srcPath, newSamplePath + '/target', newSamplePath + '/mapping.json', newSamplePath + '/structured']);
        out('Successful split your swagger file');
        out('Running docfx...');
        await process.chdir(newSamplePath);
        if (!await fs.pathExists(localBuildPath)) {
            await spawnProcess('powershell.exe', [newSamplePath + '/.openpublishing.build.ps1']);
        } else {
            await spawnProcess('powershell.exe', [newSamplePath + '/.openpublishing.build.ps1', '-parameters "targets=localBuild"']);
        }
        await fs.copy(newSamplePath + '/structured', swaggerFolder);
        out('Successful generate local preview files.');
    } catch (error) {
        console.log(error);
        throw new Error(error);
    }
}

async function preview(generatedYamlPath: string, doc: vscode.TextDocument) {
    out("Start previewing...");
    const relativePath = generatedYamlPath.split('default')[1].replace('yml', 'html');

    const htmlPath = path.join(generateHtmlPath, relativePath);
    const wrapperedPath = vscode.Uri.file(htmlPath);
    await replaceFile(htmlPath, '<head>', `<head>\n<base href="${wrapperedPath.toString()}"/>`);
    await vscode.commands.executeCommand("vscode.previewHtml", wrapperedPath, vscode.ViewColumn.Two, 'Preview page');
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
}

async function replaceFile(path: string, from: string, to: string) {
    const options = {
        files: path,
        from: from,
        to: to,
    };
    try {
        const changes = await replace(options);
        console.log('Modified file:', changes.join(', '));
    } catch (error) {
        throw new Error(error);
    }
}

async function spawnProcess(cmd: string, args: string[]) {
    const promise = spawn(cmd, args);

    const childProcess = promise.childProcess;

    childProcess.stdout.on('data', (data: any) => {
        console.info('[spawn]: %s ', data.toString());
    });
    childProcess.stderr.on('data', (data: any) => {
        console.warn('[spawn]: %s', data.toString());
    });
    return promise;
}