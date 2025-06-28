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
            const messages = Array.from(nodes).map(node => node.innerText);
            ipcRenderer.invoke('translate', messages)
                .then(translated => {
                    for (const node of nodes) {
                        const message = node.innerText;
                        if (translated[message] && translated[message] !== message) {
                            node.innerText = translated[message];
                        }
                    }
                })
                .catch(err => console.error(err));
        }
    }
});
