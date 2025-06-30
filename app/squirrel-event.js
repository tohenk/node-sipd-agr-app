/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2025 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const path = require('path');
const spawn = require('child_process').spawn;
const { app } = require('electron');

const persistentLog = false;

let debug;
function createLogger() {
    if (!debug) {
        if (persistentLog) {
            let logger;
            debug = (...args) => {
                if (!logger) {
                    const fs = require('fs');
                    const userDataDir = app.getPath('userData');
                    const logFile = path.join(userDataDir, 'squirrel.log');
                    const outStream = fs.createWriteStream(logFile, {flags: 'a'});
                    logger = new console.Console(outStream, outStream);
                }
                logger.log(...args);
            }
        } else {
            debug = require('debug')('app:squirrel');
        }
    }
}

function handleSquirrelEvent(callback) {
    let res = false;
    if (process.platform === 'win32') {
        const appFolder = path.dirname(process.execPath);
        const rootFolder = path.resolve(appFolder, '..');
        const updateExe = path.resolve(path.join(rootFolder, 'Update.exe'));

        createLogger();

        let event;
        const prefix = '--squirrel-';
        const args = process.argv.slice(1);
        if (args.length) {
            debug('Arguments', args);
        }
        while (args.length) {
            const cmd = args.shift();
            if (cmd.startsWith(prefix)) {
                event = cmd.substr(prefix.length);
                if (typeof callback === 'function') {
                    const retval = callback({event, root: rootFolder, app: appFolder});
                    if (retval !== undefined) {
                        res = retval;
                    }
                }
                break;
            }
        }
        if (event) {
            debug('processing event `%s`', event);
            const run = args => {
                debug('spawning `%s` with args `%s`', updateExe, args);
                spawn(updateExe, args, {detached: true});
            };
            const target = path.basename(process.execPath);
            switch (event) {
                case 'install':
                case 'updated':
                    run(['--createShortcut', target]);
                    res = true;
                    break;
                case 'uninstall':
                    run(['--removeShortcut', target]);
                    res = true;
                    break;
                case 'obsolete':
                    res = true;
                    break;
                case 'firstrun':
                    break;
                default:
                    debug('unknown event `%s`', event);
                    break;
            }
        }
    }
    return res;
}

module.exports = handleSquirrelEvent;