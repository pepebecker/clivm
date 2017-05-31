#! /usr/bin/env node

'use strict'

const multiselectPrompt = require('multiselect-prompt')
const pkg = require('./package.json')
const envPaths = require('env-paths')
const figures = require('figures')
const chalk = require('chalk')
const path = require('path')
const fs = require('mz/fs')
const so = require('so')

const appHome = envPaths(pkg.name).data
const appBin = path.join(appHome, 'bin')

const tick = chalk.green(figures.tick)

const printOutput = (data) => {
	if (data.alreadyPatched) {
		process.stdout.write(`${tick} ${chalk.green('Already patched')} ${data.shell.type} – ${data.shell.value}`)
	} else {
		process.stdout.write(`${tick} ${chalk.green('Sucessfully patched')} ${data.shell.type} – ${data.shell.value}`)
	}
}

const catchError = (err) => {
	process.stderr.write(err.toString())
	process.statusCode = 1
}

const patchProfile = so(function* (patch, shell) {
	try {
		const exists = yield fs.exists(shell.value)
		if (exists) {
			const data = yield fs.readFile(shell.value, 'utf8')
			if (data.includes(patch)) {
				return {alreadyPatched: true, shell}
			} else {
				yield fs.writeFile(shell.value, patch, {encoding: 'utf8', flag: 'a'})
				return {shell}
			}
		} else {
			throw new Error('File does not exist')
		}
	} catch (err) {
		throw err
	}
})

const patchBash = (shell) => {
	const patch = `\n# CLI Version Manager\nexport PATH="${appBin}":$PATH\n`
	return patchProfile(patch, shell)
}

const patchFish = (shell) => {
	const patch = `\n# CLI Version Manager\nset -gx PATH "${appBin}" $PATH\n`
	return patchProfile(patch, shell)
}

const prompt = (question, shells) => new Promise((yay, nay) => {
	const shellSuggestions = shells.map((shell) => ({title: shell.type + ' – ' + shell.file, type: shell.type, value: shell.file}))
	.filter((shell) => shell.type === 'bash' || shell.type === 'fish')

	multiselectPrompt(question, shellSuggestions)
	.on('submit', yay)
	.on('error', nay)
})

const launch = so(function* (shells) {
	try {
		const items = yield prompt('For which shells do you want to install this tool?', shells)
		for (let shell of items) {
			if (shell.selected) {
				if (shell.type === 'bash') printOutput(yield patchBash(shell))
				if (shell.type === 'fish') printOutput(yield patchFish(shell))
			}
		}
		process.stdout.write(chalk.white('\n\nYou have to reset your current shell or open a new shell to properly use this setup of clivm.\n\n'))
	} catch (err) {
		catchError(err)
	}
})

launch(require('shells')())
