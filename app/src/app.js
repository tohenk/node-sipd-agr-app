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

const fs = require('fs');
const path = require('path');
const Stringify = require('@ntlab/ntlib/stringify');
const Work = require('@ntlab/work/work');
const { ipcMain } = require('electron');
const debug = require('debug')('app:core');

class App {

    config = {}

    constructor(config) {
        this.config = config;
    }

    splashMessage(message) {
        if (this.parent && this.parent.splash) {
            this.parent.splash.webContents.send('splash-message', message);
        }
    }

    connectIpc() {
        return new Promise((resolve, reject) => {
            this.ipcs = {};
            const dir = path.join(__dirname, 'ipc');
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (!file.startsWith('~') && file.endsWith('.js')) {
                    const channel = file.substring(0, file.length - 3);
                    const IpcClass = require(path.join(dir, channel));
                    const ipc = new IpcClass({parent: this.parent});
                    this.ipcs[channel] = ipc;
                    ipcMain.handle(channel, async (event, data) => {
                        ipc.execute = async (data, webContents) => {
                            if (ipc.webContents !== webContents) {
                                ipc.webContents = webContents;
                            }
                            const res = {success: false};
                            try {
                                await ipc.handle(data, res);
                                res.success = true;
                                debug(`IPC ${channel} done with ${Stringify.from(res)}`);
                            }
                            catch (err) {
                                console.error(err);
                                res.error = err;
                                debug(`IPC ${channel} failed with ${err}`);
                            }
                            return res;
                        }
                        return await ipc.execute(data, event.sender);
                    });
                }
            });
            this.parent.executeIpc = async (channel, data, webContents) => {
                if (!this.ipcs[channel]) {
                    throw new Error(this.parent.translate('IPC channel %IPC% not available!', {IPC: channel}));
                }
                return await this.ipcs[channel].execute(data, webContents);
            }
            resolve();
        });
    }

    initDone() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.parent.splash.close();
                resolve();
            }, 5000);
        });
    }

    doWork(work, title) {
        return new Promise((resolve, reject) => {
            if (typeof work == 'function') {
                title = this.parent.translate(title);
                this.splashMessage(title);
                this.parent.addLog(`Init: ${title}...`);
                console.log('Init: %s...', title);
                work.apply(this)
                    .then(() => resolve())
                    .catch(err => reject(err));
            } else {
                reject(`Work handler for ${title} must be function!`);
            }
        });
    }

    start(parent) {
        this.parent = parent;
        return Work.works([
            [w => this.doWork(this.connectIpc, 'Registering IPC channels')],
            [w => this.doWork(this.initDone, 'Application initialization done')],
        ]);
    }
}

module.exports = App;