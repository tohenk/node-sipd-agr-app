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
const Work = require('@ntlab/work/work');
const Queue = require('@ntlab/work/queue');
const JSZip = require('jszip');
const { dialog, shell } = require('electron');
const { glob } = require('glob');
const path = require('path');

class Agr extends IpcCore {

    async handle(data, res) {
        const configFile = this.parent.getTranslatedPath(this.parent.getConfigFile('agr.json'));
        if (fs.existsSync(configFile)) {
            if (this.fork === undefined) {
                this.run(this.parent.getAgrConfFile(configFile), this.getMode(data.mode));
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

    run(config, mode) {
        const sipdAgr = require.resolve('@ntlab/sipd-agr');
        if (sipdAgr) {
            delete this.result;
            delete this.error;
            const args = [`--config=${config}`, `--mode=${mode}`];
            if (this.parent.env.clean) {
                args.push('--clean');
            }
            if (this.parent.env.nodownload) {
                args.push('--no-download');
            }
            const fork = require('child_process').fork;
            this.fork = fork(sipdAgr, args, {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            });
            this.fork.stdout.on('data', line => {
                this.parent.addLog(line);
            });
            this.fork.stderr.on('data', line => {
                this.parent.addLog(line);
            });
            this.fork.on('exit', code => {
                this.result = code;
                if (code === 0) {
                    if (this.parent.env.zip) {
                        this.zip(mode);
                    } else {
                        this.browseOutdir(this.parent.config.outdir);
                    }
                } else {
                    delete this.fork;
                    dialog.showMessageBoxSync({
                        title: this.parent.translate('Information'),
                        message: this.parent.translate('SIPD Agr process done with status %CODE%!', {CODE: code}),
                        type: 'info'
                    });
                }
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

    zip(mode) {
        let topdir, subdir = false;
        switch (mode) {
            case 'download':
                topdir = path.join(this.parent.config.outdir, 'agr');
                subdir = true;
                break;
            case 'refs':
                topdir = path.join(this.parent.config.outdir, 'refs');
                break;
        }
        if (fs.existsSync(topdir)) {
            return Work.works([
                [w => glob(path.join(topdir, '*'), {withFileTypes: true, windowsPathsNoEscape: true}), w => subdir],
                [w => new Promise((resolve, reject) => {
                    const dirs = [];
                    if (subdir) {
                        dirs.push(...w.getRes(0)
                            .map(f => f.isDirectory() ? path.join(f.path, f.name) : null)
                            .filter(Boolean)
                            .sort());
                    } else {
                        dirs.push(topdir);
                    }
                    resolve(dirs);
                })],
                [w => new Promise((resolve, reject) => {
                    const q = new Queue(w.getRes(1), dir => {
                        this.zipDir(dir)
                            .then(zipName => {
                                this.parent.addLog(`Zip ${zipName} created...`);
                                q.next();
                            })
                            .catch(err => {
                                console.error(err);
                                q.next();
                            });
                    });
                    q.once('done', () => resolve());
                })],
                [w => Promise.resolve(this.browseOutdir(topdir))],
            ]);
        } else {
            Promise.resolve(this.browseOutdir(this.parent.config.outdir));
        }
    }

    zipDir(dir) {
        const zipName = path.join(dir, `${path.basename(dir)}.zip`);
        const zip = new JSZip();
        return Work.works([
            [w => Promise.resolve(fs.renameSync(zipName, zipName + '~')), w => fs.existsSync(zipName)],
            [w => glob(path.join(dir, '*.xlsx'), {withFileTypes: true, windowsPathsNoEscape: true})],
            [w => new Promise((resolve, reject) => {
                const q = new Queue(w.getRes(1), file => {
                    const filename = path.join(file.path, file.name);
                    if (fs.existsSync(filename)) {
                        fs.readFile(filename, (err, data) => {
                            if (!err) {
                                zip.file(file.name, data);
                            }
                            q.next();
                        });
                    } else {
                        q.next();
                    }
                });
                q.once('done', () => {
                    if (Object.keys(zip.files).length) {
                        zip.generateAsync({
                            type: 'nodebuffer',
                            compression: 'DEFLATE',
                            compressionOptions: {
                                level: 9
                            },
                        })
                        .then(stream => {
                            fs.writeFileSync(zipName, stream);
                            resolve(zipName);
                        })
                        .catch(err => reject(err));
                    } else {
                        resolve();
                    }
                });
            })],
        ]);
    }

    browseOutdir(dir) {
        delete this.fork;
        if (fs.existsSync(dir)) {
            shell.openExternal(dir);
        }
        dialog.showMessageBox({
            title: this.parent.translate('Information'),
            message: this.parent.translate('SIPD Agr processing is done!'),
            type: 'info'
        });
    }
}

module.exports = Agr;