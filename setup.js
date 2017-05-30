#! /usr/bin/env node

'use strict'

const prompt = require('multiselect-prompt')
const pkg = require('./package.json')
const envPaths = require('env-paths')
const figures = require('figures')
const chalk = require('chalk')
const path = require('path')
const fs = require('mz/fs')

const appHome = envPaths(pkg.name).data
const appBin = path.join(appHome, 'bin')

const tick = chalk.green(figures.tick)
const cross = chalk.red(figures.cross)

const patch = (patch, shell) => {
	return fs.exists(shell.value).then((exists) => {
		if (exists) {
			fs.readFile(shell.value, 'utf8', (err, data) => {
				if (err) {
					console.error(cross, err.toString())
					process.exitCode = 1
					return
				}
				if (data.includes(patch)) {
					console.log(`${tick} ${chalk.green('Already patched')} ${shell.type} – ${shell.value}`)
				} else {
					fs.writeFile(shell.value, patch, {encoding: 'utf8', flag: 'a'}, (err) => {
						if (err) throw err
						console.log(`${tick} ${chalk.green('Sucessfully patched')} ${shell.type} – ${shell.value}`)
					})
				}
			})
		} else {
			console.log(`${cross} ${chalk.red('File does not exist')} ${shell.value}`)
		}
	})
}

const patchBash = (shell) => {
	const patchData = `\n# CLI Version Manager\nexport PATH="${appBin}":$PATH\n`
	return patch(patchData, shell)
}

const patchFish = (shell) => {
	const patchData = `\n# CLI Version Manager\nset -gx PATH "${appBin}" $PATH\n`
	return patch(patchData, shell)
}

let shells = require('shells')()
shells = shells.map((shell) => ({title: shell.type + ' – ' + shell.file, type: shell.type, value: shell.file}))
shells = shells.filter((shell) => shell.type === 'bash' || shell.type === 'fish')

prompt('For which shells do you want to install this tool?', shells)
.on('submit', (items) => {
	for (let shell of items) {
		if (!shell.selected) continue

		if (shell.type === 'bash') {
			patchBash(shell)
		}

		if (shell.type === 'fish') {
			patchFish(shell)
		}
	}
})
