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
const Cmd = require('@ntlab/ntlib/cmd');

Cmd.addBool('help', 'h', 'Show program usage').setAccessible(false);
Cmd.addVar('config', '', 'Read app configuration from file', 'config-file');

const configSave = false;
const dotEnv = '.env';
const confAgr = 'agr.json';

let squirrel;
if (require('./squirrel-event')(data => {squirrel = data}) || !Cmd.parse() || (Cmd.get('help') && usage())) {
    if (squirrel) {
        switch (squirrel.event) {
            case 'uninstall':
            case 'updated':
            case 'obsolete':
                if (configSave) {
                    const userDataDir = require('electron').app.getPath('userData');
                    [dotEnv, confAgr].forEach(file => {
                        const filename = path.join(squirrel.app, file);
                        if (fs.existsSync(filename)) {
                            fs.copyFileSync(filename, path.join(userDataDir, file));
                        }
                    });
                }
                break;
        }
    }
    process.exit();
}

const Work = require('@ntlab/work/work');
const { app, dialog, ipcMain, BrowserWindow, Menu } = require('electron');
const debug = require('debug')('app:main');

class MainApp
{
    config = {}
    logs = []
    ready = false

    initializeFirstRun() {
        if (squirrel && squirrel.event === 'firstrun' && configSave) {
            const userDataDir = app.getPath('userData');
            [dotEnv, confAgr].forEach(file => {
                const filename = path.join(userDataDir, file);
                if (fs.existsSync(filename)) {
                    fs.copyFileSync(filename, path.join(squirrel.app, file));
                    fs.unlinkSync(filename);
                }
            });
        }
    }

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
    }

    initializeDefaultConfig() {
        for (const [k, v] of Object.entries(this.getDefaults())) {
            if (this.config[k] === undefined) {
                if (typeof v === 'function') {
                    this.config[k] = v();
                } else {
                    this.config[k] = v;
                }
            }
        }
    }

    initializeEnv() {
        const defaults = {
            clean: true,
            zip: true,
        }
        this.envFile = this.getConfigFile(dotEnv);
        if (fs.existsSync(this.envFile)) {
            this.env = JSON.parse(fs.readFileSync(this.envFile));
        } else {
            this.env = defaults;
        }
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
        ipcMain.handle('size', (event, data) => {
            const browser = BrowserWindow.fromWebContents(event.sender);
            if (browser && data.width && data.height) {
                browser.setContentSize(data.width, data.height);
                if (data.center) {
                    browser.center();
                }
            }
        });
        ipcMain.handle('env', (event, data) => {
            if (Array.isArray(data)) {
                const res = {};
                for (const env of data) {
                    if (this.env[env] !== undefined) {
                        res[env] = this.env[env];
                    }
                }
                return res;
            } else if (data.set && data.value !== undefined && data.value !== null) {
                let res = false;
                const env = data.set;
                if (this.env[env] !== undefined && this.env[env] !== data.value) {
                    this.env[env] = data.value;
                    fs.writeFileSync(this.envFile, JSON.stringify(this.env));
                }
                return res;
            }
        });
    }

    getDefaults() {
        return {
            rootdir: __dirname,
            workdir: process.cwd(),
            staticdir: () => this.getAssetDir('static'),
            i18ndir: () => this.getAssetDir('i18n'),
            icondir: () => this.getAssetDir('icons'),
            outdir: () => path.join(app.getPath('documents'), 'sipd-agr'),
            userdir: () => app.getPath('userData'),
            locale: 'id',
            debug: false,
            'save-messages': true,
        }
    }

    getAssetDir(...dirs) {
        return path.join(this.config.rootdir, 'assets', ...dirs);
    }

    getStatic(...files) {
        return path.join(this.config.staticdir, ...files);
    }

    getConfigFile(...files) {
        return path.join(app.isPackaged ? this.config.userdir : this.config.workdir, ...files);
    }

    getAgrConf() {
        return this.getTranslatedPath(this.getConfigFile(confAgr));
    }

    getAgrConfRun() {
        let res;
        const file = this.getAgrConf();
        if (fs.existsSync(file)) {
            res = this.getConfigFile('.agr');
            const conf = JSON.parse(fs.readFileSync(file));
            const year = conf.year || new Date().getFullYear();
            fs.writeFileSync(res, JSON.stringify({
                ...conf,
                autoClose: true,
                workdir: this.config.outdir,
                dir: path.join(this.config.outdir, year.toString(), path.sep),
            }));
        }
        return res;
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

    addLog(log) {
        const lines = log.toString()
            .split('\n')
            .filter(a => a.length);
        this.logs.push(...lines);
        for (const line of lines) {
            this.notify('log', line);
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
        const w = new BrowserWindow({...options, ...this.getCommonPreferences()});
        w.webContents.on('dom-ready', () => {
            w.webContents.executeJavaScript(`
electronAPI.translate();
electronAPI.configure();
            `);
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
            this.win = this.createWin({title: `${app.getName()} v${app.getVersion()}`, width: 500, height: 375, center: true, maximizable: false},
                this.getStatic('app', 'index.html'));
            const baseOptions = {parent: this.win, modal: true, minimizable: false, maximizable: false};
            this.splash = this.createWin({width: 500, height: 300, frame: false, ...baseOptions},
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
            this.notify('ready', {ready: true});
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
        this.initializeFirstRun();
        this.initializeConfig();
        this.initializeDefaultConfig();
        this.initializeEnv();
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
