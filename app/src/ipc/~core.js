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

class IpcCore {

    constructor(options) {
        this.parent = options.parent;
    }

    sendMessage(message, data) {
        if (this.webContents) {
            this.webContents.send(message, data);
        }
    }

    createWin(name, data) {
        return new Promise((resolve, reject) => {
            if (!this[name]) {
                const options = data.options || {};
                options.name = name;
                if (data.parent) {
                    options.parent = data.parent;
                }
                if (this.bounds) {
                    Object.assign(options, this.bounds);
                }
                this[name] = this.parent.createWin(options, data.url);
                if (data.props) {
                    Object.assign(this[name], data.props);
                }
                this[name].on('close', e => {
                    this.bounds = this[name].getBounds();
                });
                this[name].on('closed', e => {
                    this.ready = false;
                    this[name] = null;
                });
            }
            if (data.parent) {
                if (this[name].getParentWindow() !== data.parent) {
                    this[name].setParentWindow(data.parent);
                }
            }
            const reload = this.lastUrl === undefined || this.lastUrl !== data.url || data.force;
            if (!this.ready || reload) {
                this[name].webContents.once('dom-ready', () => {
                    this.ready = true;
                    resolve();
                });
            }
            if (reload) {
                this.ready = false;
                this.lastUrl = data.url;
                this[name].loadURL(data.url);
            }
            if (this.ready) {
                resolve();
            }
        });
    }
}

module.exports = IpcCore;