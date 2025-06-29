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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    listen: (event, handler) => ipcRenderer.on(event, (event, data) => {
        if (typeof handler === 'function') {
            handler(data, event);
        }
    }),
    send: (message, data) => {
        ipcRenderer.send(message, data);
    },
    invoke: (message, data = {}, callback = null) => {
        if (typeof data === 'function') {
            callback = data;
            data = {};
        }
        ipcRenderer.invoke(message, data)
            .then(res => {
                if (typeof callback === 'function') {
                    callback(res);
                }
            })
            .catch(err => console.log(err));
    },
    translate: () => {
        const nodes = document.querySelectorAll('[data-translate="true"]');
        if (nodes.length) {
            const items = Array.from(nodes);
            const messages = items.map(node => node.innerText);
            messages.push(...items
                .map(node => node.title)
                .filter(Boolean));
            ipcRenderer.invoke('translate', messages)
                .then(translated => {
                    for (const node of nodes) {
                        for (const prop of ['innerText', 'title']) {
                            const message = node[prop];
                            if (message && translated[message] && translated[message] !== message) {
                                node[prop] = translated[message];
                            }
                        }
                    }
                })
                .catch(err => console.error(err));
        }
    },
    configure: () => {
        const keyName = 'data-env-key';
        const nodes = document.querySelectorAll(`[${keyName}]`);
        if (nodes.length) {
            const val = (node, value) => {
                let res;
                if (node.nodeName === 'INPUT') {
                    const itype = node.attributes.getNamedItem('type');
                    if (itype && itype.nodeValue.toLowerCase() === 'checkbox') {
                        if (value !== undefined && node.checked !== value) {
                            node.checked = value;
                        }
                        res = node.checked;
                    } else {
                        if (value !== undefined) {
                            node.nodeValue = value;
                        }
                        res = node.nodeValue;
                    }
                }
                return res;
            }
            const configs = Array.from(nodes)
                .map(node => node.attributes.getNamedItem(keyName).nodeValue);
            ipcRenderer.invoke('env', configs)
                .then(values => {
                    for (const node of nodes) {
                        const cfg = node.attributes.getNamedItem(keyName).nodeValue;
                        if (values[cfg] !== undefined) {
                            val(node, values[cfg]);
                        }
                    }
                })
                .catch(err => console.error(err));
            for (const node of nodes) {
                node.addEventListener('change', e => {
                    const cfg = node.attributes.getNamedItem(keyName).nodeValue;
                    ipcRenderer.invoke('env', {set: cfg, value: val(node)});
                });
            }
        }
    }
});
