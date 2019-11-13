import { exec } from "child_process";
import * as download from "download";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { showInformationMessage, showInformationMessageOnce } from "./extension";
import { localize } from "./i18n";
import log from "./logger";

const homedir = os.homedir();

function getAixcoderInstallUserPath() {
    let userHome = homedir;
    if (process.platform === "win32") {

    } else if (process.platform === "darwin") {
        userHome = path.join(userHome, "Library", "Application Support");
    } else {
    }
    const installInfoPath = path.join(userHome, "aiXcoder", "installer");
    return installInfoPath;
}

async function getActivePid(pid: string) {
    // ps -ax | awk '$1 == 65101'
    if (!pid) {
        return null;
    }
    let cmd = "";
    let result;
    try {
        switch (process.platform) {
            case "win32":
                cmd = `wmic process where processid=${pid} get executablepath, name, processid | findstr ${pid}`;
                result = await execAsync(cmd);
                // eg.: C:\Program Files\PyCharm\bin\pycharm64.exe  pycharm64.exe 1234
                if (result) {
                    const resultLines = (result).split("\n");
                    for (const tmpLine of resultLines) {
                        if (tmpLine.indexOf(pid) >= 0) {
                            const resultSplits = tmpLine.trim().split(/\s+/);
                            if (resultSplits.length >= 2) {
                                let pid = resultSplits[resultSplits.length - 1];
                                pid = pid.trim();
                                return pid;
                            }
                        }
                    }
                }
                break;
            case "darwin":
                cmd = `ps -ax | awk '$1 == ${pid}'`;
                result = await execAsync(cmd);
                // 65101 ??         0:00.57 ./node ./entry.js
                if (result) {
                    const resultSplits = result.trim().split(/\s+/, 2);
                    if (resultSplits.length > 0) {
                        return resultSplits[0].trim();
                    }
                }
                break;
            default:
                return null;
        }
    } catch (e) {
        // no result comes to catch
        // console.log(e);
    }
    return null;
}

async function getLocalServerPid() {
    const lockfile = path.join(homedir, "aiXcoder", ".router.lock");
    try {
        await fs.stat(lockfile);
        const startPid = (await fs.readFile(lockfile, { encoding: "utf-8" })).trim();
        return getActivePid(startPid);
    } catch (e) {
        console.error(e);
    }
    return null;
}

async function softStartLocalService() {
    const pidStr = await getLocalServerPid();
    if (!pidStr) {
        launchLocalServer();
    }
}

function getExePath() {
    const localserver = path.join(getAixcoderInstallUserPath(), "localserver", "current");
    if (process.platform === "win32") {
        return path.join(localserver, "server", "aixcoder.bat");
    } else {
        return path.join(localserver, "server", "aixcoder.sh");
    }
}

function launchLocalServer() {
    const exePath = getExePath();
    execAsync(exePath).catch((e) => {
        lastOpenFailed = true;
        showInformationMessageOnce("openAixcoderUrlFailed");
        log(e);
    });
}

async function execAsync(cmd: string) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
}

let lastOpenFailed = false;
export async function openurl(url: string) {
    if (lastOpenFailed) { return; }
    if (url !== "aixcoder://localserver") {
        return;
    }
    const aixcoderPath = path.join(getAixcoderInstallUserPath(), "localserver", "current", "server");
    try {
        await fs.mkdirp(aixcoderPath);
    } catch (e) {
        //
    }
    try {
        await fs.stat(getExePath());
    } catch (e) {
        lastOpenFailed = true;
        // server not found
    }
    launchLocalServer();
}

export async function getVersion() {
    const aixcoderPath = path.join(getAixcoderInstallUserPath(), "localserver", "current", "server", ".version");
    let version: string;
    try {
        version = await fs.readFile(aixcoderPath, "utf-8");
    } catch (e) {
        version = "0.0.0";
    }
    return version;
}

interface FileProgressLite {
    percent: number;
    transferred: number;
    total: number;
}

export async function forceUpdate() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: localize("aixUpdateProgress"),
        cancellable: true,
    }, async (progress, token) => {
        const aixcoderPath = path.join(getAixcoderInstallUserPath(), "localserver", "current", "server");
        try {
            await fs.mkdirp(aixcoderPath);
        } catch (e) {
            //
        }
        let ball: string;
        if (process.platform === "win32") {
            ball = "server-win.zip";
        } else if (process.platform === "darwin") {
            ball = "server-mac.zip";
        } else {
            ball = "server-linux.tar.gz";
        }
        const stream = download(`https://github.com/aixcoder-plugin/localservice/releases/latest/download/${ball}`, aixcoderPath, {
            extract: true,
        });
        const onErr = (err?: any) => {
            vscode.window.showInformationMessage(localize("aixUpdatefailed", "https://github.com/aixcoder-plugin/localservice/releases", aixcoderPath));
        };
        token.onCancellationRequested((e) => {
            stream.end();
            if (myReq) {
                myReq.abort();
            }
            onErr();
        });
        let last = 0;
        let myReq = null;
        stream.on("request", (req: any) => {
            myReq = req;
        });
        stream.on("downloadProgress", (p: FileProgressLite) => {
            progress.report({
                message: localize("aixUpdateProgress") + ` ${p.transferred}/${p.total}`,
                increment: (p.percent - last) * 100,
            });
            last = p.percent;
        });
        stream.catch(onErr);
        await stream;
        lastOpenFailed = false;
    }).then(null, (err) => {
        log(err);
    });
}