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
const IpcCore = require('./~core');
const { dialog } = require('electron');

class Agr extends IpcCore {

    async handle(data, res) {
        const configFile = this.parent.getTranslatedPath(this.parent.getConfigFile('agr.json'));
        if (fs.existsSync(configFile)) {
            if (this.fork === undefined) {
                this.run(configFile, this.getMode(data.mode));
            } else {
                dialog.showMessageBoxSync({
                    title: this.parent.translate('Error'),
                    message: this.parent.translate('Please wait for previous task to be done!'),
                    type: 'error'
                });
            }
        } else {
            dialog.showMessageBoxSync({
                title: this.parent.translate('Error'),
                message: this.parent.translate('Configuration %CONFIG% is not exist!', {CONFIG: configFile}),
                type: 'error'
            });
        }
    }

    getMode(mode) {
        switch (mode) {
            case 'agr':
                mode = 'download';
                break;
            case 'ref':
                mode = 'refs';
                break;
        }
        return mode;
    }

    addLog(log) {
        const lines = log.toString()
            .split('\n')
            .filter(a => a.length);
        this.parent.logs.push(...lines);
        for (const line of lines) {
            this.parent.notify('log', line);
        }
    }

    run(config, mode) {
        const sipdAgr = require.resolve('@ntlab/sipd-agr');
        if (sipdAgr) {
            delete this.result;
            delete this.error;
            const fork = require('child_process').fork;
            this.fork = fork(sipdAgr, [`--config=${config}`, `--mode=${mode}`], {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            });
            this.fork.stdout.on('data', line => {
                this.addLog(line);
            });
            this.fork.stderr.on('data', line => {
                this.addLog(line);
            });
            this.fork.on('exit', code => {
                this.result = code;
                delete this.fork;
                dialog.showMessageBoxSync({
                    title: this.parent.translate('Information'),
                    message: this.parent.translate('SIPD Agr process done with status %CODE%!', {CODE: code}),
                    type: 'info'
                });
            });
            this.fork.on('error', err => {
                this.error = err;
                delete this.fork;
                dialog.showMessageBoxSync({
                    title: this.parent.translate('Error'),
                    message: this.parent.translate('SIPD Agr process failed with %ERROR%!', {ERROR: err}),
                    type: 'error'
                });
            });
        }
    }
}

module.exports = Agr;