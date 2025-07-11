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

module.exports = {
    packagerConfig: {
        asar: {
            unpackDir: '{' + [
                '**/selenium-webdriver/bin/linux',
                '**/selenium-webdriver/bin/macos',
                '**/selenium-webdriver/bin/windows',
            ].join(',') + '}'
        },
        icon: 'assets/icons/app',
        ignore: ['^/.agr', '^/.env', '^/agr.json', '^/agr/', '^/profile/', '^/refs/']
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'SIPD-Agr',
                iconUrl: 'https://raw.githubusercontent.com/tohenk/node-sipd-agr-app/master/app/assets/icons/app.ico',
                setupIcon: path.join(__dirname, 'assets', 'icons', 'app.ico'),
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32', 'darwin', 'linux'],
        }
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
    ],
    hooks: {
        postMake: async (forgeConfig, results) => {
            results.forEach(result => {
                if (Array.isArray(result.artifacts)) {
                    const productName = result.packageJSON.productName.replace(/\s/g, '-');
                    const platform = result.platform;
                    const arch = result.arch === 'ia32' ? 'x86' : result.arch;
                    result.artifacts.forEach(artifact => {
                        const artifactName = path.basename(artifact);
                        if (artifactName.match(/\.(exe|zip)$/)) {
                            let artifactSafename = artifactName.replace(/\s/g, '-');
                            const artifactNameWithPlatformArch = `${productName}-${platform}-${arch}`;
                            if (artifactSafename.indexOf(result.arch) >= 0) {
                                artifactSafename = artifactSafename.replace(result.arch, arch);
                            } else if (artifactSafename.indexOf(artifactNameWithPlatformArch) < 0) {
                                artifactSafename = artifactSafename.replace(productName, artifactNameWithPlatformArch);
                            }
                            if (artifactName !== artifactSafename) {
                                fs.renameSync(artifact, path.join(path.dirname(artifact), artifactSafename));
                            }
                        }
                    });
                }
            });
        }
    }
}
