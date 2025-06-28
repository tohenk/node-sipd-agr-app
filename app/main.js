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
const Cmd = require('@ntlab/ntlib/cmd');

Cmd.addBool('help', 'h', 'Show program usage').setAccessible(false);
Cmd.addVar('config', '', 'Read app configuration from file', 'config-file');

if (require('./squirrel-event') || !Cmd.parse() || (Cmd.get('help') && usage())) {
    process.exit();
}

const fs = require('fs');
const Work = require('@ntlab/work/work');
const { app, dialog, ipcMain, BrowserWindow, Menu } = require('electron');
const debug = require('debug')('app:main');

class MainApp
{
    config = {}
    logs = []
    ready = false

    initializeConfig() {
        let filename;
        // read configuration from command line values
        if (process.env.APP_CONFIG && fs.existsSync(process.env.APP_CONFIG)) {
            filename = process.env.APP_CONFIG;
        } else if (Cmd.get('config') && fs.existsSync(Cmd.get('config'))) {
            filename = Cmd.get('config');
        } else if (fs.existsSync(path.join(__dirname, 'config.json'))) {
            filename = path.join(__dirname, 'config.json');
        }
        if (fs.existsSync(filename)) {
            console.log('Reading configuration %s', filename);
            this.config = JSON.parse(fs.readFileSync(filename));
        }
        Object.assign(this.config, this.getConfigHandlers());
        if (!this.config.rootdir) {
            this.config.rootdir = __dirname;
        }
        if (!this.config.workdir) {
            this.config.workdir = process.cwd();
        }
        this.config.staticdir = path.join(this.config.rootdir, 'assets', 'static');
        this.config.i18ndir = path.join(this.config.rootdir, 'assets', 'i18n');
        this.config.icondir = path.join(this.config.rootdir, 'assets', 'icons');
        // check for default configuration
        if (this.config.locale === undefined) {
            this.config.locale = 'id';
        }
        if (this.config.debug === undefined) {
            this.config.debug = false;
        }
        // force save messages
        this.config['save-messages'] = true;
    }

    initializeWebdriver() {
        if (app.isPackaged) {
            const directory = {
                darwin: 'macos',
                win32: 'windows',
                cygwin: 'windows',
                linux: 'linux',
            }[process.platform];
            const filename = directory === 'windows' ? 'selenium-manager.exe' : 'selenium-manager';
            const seleniumManager = require.resolve(`selenium-webdriver/bin/${directory}/${filename}`);
            process.env.SE_MANAGER_PATH = this.getTranslatedPath(seleniumManager);
        }
    }

    InitializeCoreIpc() {
        ipcMain.handle('state', (event, data) => {
            return {ready: this.ready};
        });
        ipcMain.handle('translate', (event, data) => {
            return this.getMessages(data);
        });
    }

    getConfigHandlers() {
        return {
        }
    }

    getStatic(...names) {
        return path.join(this.config.staticdir, ...names);
    }

    getConfigFile(...names) {
        return path.join(this.config.workdir, ...names);
    }

    getTranslatedPath(path) {
        if (app.isPackaged && path.match(/app\.asar/)) {
            const translated = path.replace(/app\.asar/, 'app.asar.unpacked');
            const ofs = require('original-fs');
            if (ofs.existsSync(translated)) {
                path = translated;
            }
        }
        return path;
    }

    translate(message, params = {}) {
        const util = require('@ntlab/ntlib/util');
        const langFile = path.join(this.config.i18ndir, `messages.${this.config.locale}.json`);
        if (typeof this._messages === 'undefined') {
            this._messages = {};
            if (fs.existsSync(langFile)) {
                const messages = JSON.parse(fs.readFileSync(langFile));
                messages.forEach(msg => {
                    this._messages[msg[0]] = msg[1];
                });
            }
        }
        if (this.config['save-messages'] && !app.isPackaged) {
            if (!this._messages[message]) {
                this._messages[message] = message;
            }
            if (!this._has_save_message) {
                this._has_save_message = true;
                process.on('exit', code => {
                    debug(this.translate('Please wait, saving messages...'));
                    let messages;
                    if (fs.existsSync(langFile)) {
                        messages = JSON.parse(fs.readFileSync(langFile));
                    }
                    messages.forEach(msg => delete this._messages[msg[0]]);
                    Object.keys(this._messages).forEach(msg => messages.push([msg, msg]));
                    fs.writeFileSync(langFile, JSON.stringify(messages, null, '  '));
                });
            }
        }
        message = this._messages[message] ? this._messages[message] : message;
        return util.trans(message, params);
    }

    getMessages(messages) {
        const res = {};
        if (Array.isArray(messages)) {
            for (const message of messages) {
                const translated = this.translate(message);
                if (translated !== message) {
                    res[message] = translated;
                }
            }
        }
        return res;
    }

    notify(event, data) {
        for (const browser of BrowserWindow.getAllWindows()) {
            browser.webContents.send(event, data);
        }
    }

    getCommonPreferences() {
        return {
            webPreferences: {
                preload: this.getStatic('preload.js'),
            }
        };
    }

    showError(err) {
        if (this.splash) {
            this.splash.close();
        }
        if (!this.win.isVisible()) {
            this.win.show();
        }
        this.win.loadFile(this.getStatic('error', 'error.html'));
        this.win.webContents.on('dom-ready', () => {
            const util = require('util');
            this.win.webContents.send('error-message', util.inspect(err));
        });
    }

    createWin(options, fileOrUrl = null) {
        const w = new BrowserWindow(Object.assign({}, options, this.getCommonPreferences()));
        w.webContents.on('dom-ready', () => {
            w.webContents.executeJavaScript('electronAPI.translate();');
        });
        if (fileOrUrl) {
            if (fileOrUrl.match(/^http(s)?\:\/\/(.*)$/)) {
                w.loadURL(fileOrUrl);
            } else if (fs.existsSync(fileOrUrl)) {
                w.loadFile(fileOrUrl);
            }
        }
        return w;
    }

    createWindow() {
        return new Promise((resolve, reject) => {
            this.win = this.createWin({width: 400, height: 250, center: true, maximizable: false},
                this.getStatic('app', 'index.html'));
            const baseOptions = {parent: this.win, modal: true, minimizable: false, maximizable: false};
            this.splash = this.createWin(Object.assign({width: 500, height: 300, frame: false}, baseOptions),
                this.getStatic('splash', 'splash.html'));
            this.splash.webContents.on('dom-ready', () => resolve());
        });
    }

    configureApp() {
        return new Promise((resolve, reject) => {
            if (!this.config.debug) {
                Menu.setApplicationMenu(null);
            }
            resolve();
        });
    }

    startApp() {
        const MyApp = require('./src/app');
        this.app = new MyApp(this.config);
        Work.works([
            [w => this.createWindow()],
            [w => this.configureApp()],
            [w => this.app.start(this)],
        ])
        .then(() => {
            console.log(`App ${app.getName()} is ready...`);
            this.ready = true;
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('ready', {ready: true});
            });
        })
        .catch(err => {
            this.showError(err);
        });
    }

    handleEvents() {
        app.whenReady().then(() => {
            if (!app.requestSingleInstanceLock()) {
                dialog.showMessageBoxSync({
                    title: this.translate('Error'),
                    message: this.translate('%APP% already running!', {APP: app.getName()}),
                    type: 'error'
                });
                app.quit();
            } else {
                this.startApp();
            }
        });
        app
            .on('window-all-closed', () => {
                if (process.platform !== 'darwin') {
                    app.quit();
                }
            })
            .on('activate', () => {
                // nothing
            })
            .on('will-quit', () => {
                // nothing
            });
    }

    getName() {
        return app.getName();
    }
    
    run() {
        this.initializeConfig();
        this.initializeWebdriver();
        this.InitializeCoreIpc();
        this.handleEvents();
    }
}

// main entry

(function run() {
    new MainApp().run();
})();

// usage help

function usage() {
    console.log('Usage:');
    console.log('  node %s [options]', path.basename(process.argv[1]));
    console.log('');
    console.log('Options:');
    console.log(Cmd.dump());
    console.log('');
    return true;
}
